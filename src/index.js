const express = require("express");
const printer = require("pdf-to-printer");
const fs = require("fs");
const os = require("os");
const path = require("path");
const cors = require("cors");
const { execSync } = require("child_process");

const app = express();

// 💡 Allow tất cả domain
app.use(cors({ origin: "*" }));

// Nhận PDF dạng ArrayBuffer hoặc base64
app.use(express.json({ limit: "10mb" }));
app.use(express.raw({ type: "application/pdf", limit: "20mb" }));

function getSumatraPath() {
    if (process.pkg) {
        return path.join(path.dirname(process.execPath), "SumatraPDF-3.4.6-32.exe");
    } else {
        return path.join(__dirname, "../SumatraPDF-3.4.6-32.exe");
    }
}

function isPrinterConnected(printerName) {
    try {
        const cmd = `powershell -Command "Get-WmiObject Win32_Printer | Where-Object { $_.Name -eq '${printerName}' } | Select-Object Name, WorkOffline, PrinterStatus | ConvertTo-Json"`;
        const output = execSync(cmd, { encoding: "utf8" }).trim();

        if (!output) return false;

        const info = JSON.parse(output);

        // Nếu nhiều printer trùng tên → lấy array
        const p = Array.isArray(info) ? info[0] : info;

        // Trường hợp không tìm thấy
        if (!p) return false;

        // ❗ WorkOffline = true => máy đang offline
        if (p.WorkOffline === true) return false;

        // ❗ PrinterStatus = 7 => offline
        if (p.PrinterStatus === 7) return false;

        // ✔ Nếu qua 2 kiểm tra trên → máy đang ONLINE
        return true;

    } catch (e) {
        console.error("Error check printer:", e);
        return false;
    }
}


function filterRealPrinters(printers) {
    const virtualNames = [
        "Microsoft Print to PDF",
        "Microsoft XPS Document Writer",
        "Send To OneNote",
        "Fax",
        "OneNote",
        "PDF",
        "XPS",
        "CutePDF",
        "Adobe PDF"
    ];

    return printers.filter(p => {
        const name = p.name || p.deviceId || "";
        if (virtualNames.some(v => name.toLowerCase().includes(v.toLowerCase()))) {
            return false;
        }
        return isPrinterConnected(name);
    });
}

async function getRealDefaultPrinter(realPrinters) {
    // Không có máy in thật
    if (realPrinters.length === 0) return null;

    const defaultPrinterName = await printer.getDefaultPrinter();

    // Nếu default printer là máy thật → dùng luôn
    const matched = realPrinters.find(p =>
        p.name === defaultPrinterName || p.deviceId === defaultPrinterName
    );

    if (matched) return matched;

    // Nếu default là máy ảo → dùng máy thật đầu tiên trong danh sách
    return realPrinters[0];
}

app.get("/status", async (req, res) => {
    try {
        const printers = await printer.getPrinters();
        const realPrinters = filterRealPrinters(printers);
        const realDefaultPrinter = await getRealDefaultPrinter(realPrinters);

        if (!realDefaultPrinter) {
            return res.status(500).json({ error: "Cannot find real printer in this device, please connect or check your printer's driver" });
        }

        res.json({
            installed: true,
            printers: realPrinters,
            defaultPrinter: realDefaultPrinter
        });
    } catch (err) {
        res.status(500).json({ installed: false, err: err.message });
    }
});

app.post("/print", async (req, res) => {
    try {
        const { data, fileType, mimetype, options } = req.body;

        const buffer = Buffer.from(data, "base64");

        let ext = fileType === "pdf"
            ? "pdf"
            : fileType === "image"
                ? mimetype.split("/")[1]
                : "txt";

        const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.${ext}`);
        fs.writeFileSync(tempPath, fileType === "text" ? data : buffer);

        await printer.print(tempPath, {
            printer: options.printer,
            sumatraPdfPath: getSumatraPath(),
            paperSize: options.paperSize,
            side: options.side,
            copies: options.copies,
            scale: "fit",
            monochrome: options.monochrome ?? false
        });

        fs.unlinkSync(tempPath);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});


app.listen(14001, () => console.log("🚀 Print Service is running"));
