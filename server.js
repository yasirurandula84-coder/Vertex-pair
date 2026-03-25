const express = require('express');
const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const fs = require("fs-extra");
const path = require('path');
const { exec } = require("child_process");
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static('public')); // public folder eka static karanna

const PORT = process.env.PORT || 3000;

app.get('/pair', async (req, res) => {
    let num = req.query.num;
    if (!num) return res.status(400).json({ error: "Number required" });

    // Hama user kenektama wenas temp folder ekak hadamu
    const sessionDir = path.join(__dirname, 'temp_session_' + num);
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: "silent" }),
        browser: ["VORTEX-MD", "Chrome", "1.0.0"]
    });

    if (!sock.authState.creds.registered) {
        try {
            await delay(2000);
            const code = await sock.requestPairingCode(num);
            res.json({ code: code });
        } catch (err) {
            return res.status(500).json({ error: "Failed to get code" });
        }
    }

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            await delay(5000);
            
            // Session folder eka base64 string ekakata harawamu
            exec(`tar -czf session.tar.gz -C ${sessionDir} . && base64 session.tar.gz`, async (err, stdout) => {
                const sessionId = stdout.trim();
                const welcomeMsg = `*🚀 VORTEX-MD SESSION CONNECTED!* \n\n_Copy the ID below and use it in your bot config._\n\n*SESSION-ID:*\n\n${sessionId}`;
                
                // Link karapu number ekatama ID eka yawamu
                await sock.sendMessage(sock.user.id, { text: welcomeMsg });
                
                // Temporary files cleanup
                setTimeout(async () => {
                    await fs.remove(sessionDir);
                    if (fs.existsSync('session.tar.gz')) fs.removeSync('session.tar.gz');
                }, 5000);
            });
        }
    });
});

app.listen(PORT, () => console.log(`Generator running on port ${PORT}`));