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
        const cmd = `powershell -Command "Get-WmiObject Win32_PnPEntity | Where-Object { $_.Name -like '*${printerName}*' } | ConvertTo-Json"`;
        const output = execSync(cmd, { encoding: "utf8" });

        if (!output.trim()) return false;

        const data = JSON.parse(output);

        // Nếu là mảng hoặc 1 object
        return Array.isArray(data) ? data.length > 0 : true;
    } catch (e) {
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

async function getRealDefaultPrinter() {
    const printers = await printer.getPrinters();
    const realPrinters = filterRealPrinters(printers);

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

app.post("/print", async (req, res) => {
    try {
        const { data, fileType, mimetype } = req.body;

        const buffer = Buffer.from(data, "base64");

        let ext;

        if (fileType === "pdf") ext = "pdf";
        else if (fileType === "image") ext = mimetype.split("/")[1];
        else if (fileType === "text") ext = "txt";
        else {
            return res.status(400).json({ error: "File not support" });
        }

        const tempPath = path.join(os.tmpdir(), `temp_${Date.now()}.${ext}`);
        fs.writeFileSync(tempPath, fileType === "text" ? data : buffer);

        // 🖨 Auto pick real printer
        const realDefaultPrinter = await getRealDefaultPrinter();

        if (!realDefaultPrinter) {
            fs.unlinkSync(tempPath);
            return res.status(500).json({ error: "Cannot find real printer in this device" });
        }

        console.log("📌 Printing via:", realDefaultPrinter.name || realDefaultPrinter.deviceId);

        await printer.print(tempPath, {
            printer: realDefaultPrinter.name,
            sumatraPdfPath: getSumatraPath(),
            win32: [
                "print-dialog=no",
                "paper=A4",       // 👈 BẮT BUỘC
                "simplex"         // in 1 mặt
            ],
            scale: "fit"
        });

        fs.unlinkSync(tempPath);
        console.log("📌 Printing success:", realDefaultPrinter.name || realDefaultPrinter.deviceId);

        res.json({ success: true, printer: realDefaultPrinter });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.listen(14001, () => console.log("🚀 Print Service is running"));
