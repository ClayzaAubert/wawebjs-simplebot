const fs = require('fs');
const chokidar = require('chokidar');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const path = require('path');

const SESSIONS_FOLDER_PATH = './clayzaaubert';
const SESSION_FILE_PATH = `${SESSIONS_FOLDER_PATH}/session.json`;
const COMMANDS_FOLDER_PATH = './commands';
const PREFIXES = ['.', '!', '#'];

// Membuat folder sesi jika belum ada
if (!fs.existsSync(SESSIONS_FOLDER_PATH)) {
    fs.mkdirSync(SESSIONS_FOLDER_PATH);
}

let sessionData;
let commands = {};

// Cek jika ada data sesi yang sudah tersimpan
if (fs.existsSync(SESSION_FILE_PATH)) {
    sessionData = require(SESSION_FILE_PATH);
}

// Buat instance client WhatsApp
const client = new Client({
    authStrategy: new LocalAuth({
        dataPath: SESSIONS_FOLDER_PATH,
    }),
    session: sessionData,
});

// Event ketika QR code siap
client.on('qr', (qrCode) => {
    console.log('Scan this QR code with your WhatsApp app:');
    qrcode.generate(qrCode, { small: true });
});

// Event ketika sesi berhasil disimpan
client.on('authenticated', (session) => {
    console.log('Authenticated');
    sessionData = session;
    if (sessionData) {
        fs.writeFileSync(SESSION_FILE_PATH, JSON.stringify(sessionData));
    }
});

// Event ketika pesan diterima
client.on('message', async (message) => {
    console.log(`[${message.from}] ${message.body}`);
    handleCommand(message);
});

// Event ketika koneksi sukses
client.on('ready', () => {
    console.log('WhatsApp bot is ready');
    // Memuat dan meregistrasi perintah pada saat inisialisasi
    loadCommands();
    // Membuat watcher untuk live-reloading
    setupCommandWatcher();
});

// Event ketika koneksi terputus
client.on('disconnected', (reason) => {
    console.log(`WhatsApp bot disconnected: ${reason}`);
});

// Jalankan client
client.initialize();

// Fungsi untuk menangani perintah
function handleCommand(message) {
    const args = message.body.split(' ');
    const potentialCommand = args.shift().toLowerCase();
    const prefix = PREFIXES.find((p) => potentialCommand.startsWith(p));

    if (prefix) {
        const commandName = potentialCommand.slice(prefix.length);

        if (commands[commandName]) {
            commands[commandName].execute(message);
            console.log(`[Bot] Command executed: ${commandName} by ${message.from}`);
        }
    }
}

// Fungsi untuk membaca dan meregistrasi perintah dari file
function loadCommands(folderPath = COMMANDS_FOLDER_PATH) {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });

    entries.forEach((entry) => {
        if (entry.isDirectory()) {
            // Jika itu adalah folder, rekursif memanggil fungsi
            loadCommands(`${folderPath}/${entry.name}`);
        } else if (entry.isFile() && entry.name.endsWith('.js')) {
            // Jika itu adalah file JavaScript
            const command = require(`${folderPath}/${entry.name}`);
            commands[command.name] = command;
            console.log(`Command loaded: ${command.name}`);
        }
    });
}

// Fungsi untuk meregistrasi perintah dari file
function loadCommandFile(fileName) {
    const command = require(`${COMMANDS_FOLDER_PATH}/${fileName}`);
    commands[command.name] = command;
    console.log(`Command loaded: ${command.name}`);
}

// Fungsi untuk membuat watcher dan handle live-reloading
function setupCommandWatcher() {
    const watcher = chokidar.watch(COMMANDS_FOLDER_PATH, { persistent: true });

    // Event ketika ada perubahan pada file
    watcher.on('change', async (filePath) => {
        console.log(`File changed: ${filePath}`);

        // Menggunakan path.relative untuk mendapatkan path relatif dari COMMANDS_FOLDER_PATH
        const relativePath = path.relative(COMMANDS_FOLDER_PATH, filePath);

        // Menggunakan path.join untuk mengonstruksi path file yang benar
        const normalizedPath = require.resolve(path.join(__dirname, COMMANDS_FOLDER_PATH, relativePath));


        try {
            // Menghapus cache require untuk file yang diubah
            delete require.cache[require.resolve(normalizedPath)];

            // Memuat ulang perintah dari file yang diubah
            await loadCommandFile(relativePath);

            console.log(`Command reloaded: ${normalizedPath}`);
        } catch (error) {
            console.error(`Error reloading command: ${normalizedPath}`);
            console.error(error);
        }
    });
}
