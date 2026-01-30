import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import crypto from 'crypto';
import readline from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ANSI Colors
const C = {
    reset: "\x1b[0m",
    bright: "\x1b[1m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m"
};

const log = (color, title, msg) => console.log(`${color}${C.bright}[${title}]${C.reset} ${msg}`);

console.clear();
console.log(`${C.cyan}${C.bright}${"=".repeat(60)}${C.reset}`);
console.log(`${C.blue}${C.bright}          QUATRIX - AUTOMATED SETUP WIZARD${C.reset}`);
console.log(`${C.cyan}${C.bright}${"=".repeat(60)}${C.reset}\n`);

async function runSetup() {
    try {
        // 1. Environment Check
        const nodeVersion = process.versions.node;
        log(C.blue, "CHECK", `Node.js Version: ${C.bright}${nodeVersion}${C.reset}`);

        // 2. Linux Dependency Check (SteamCMD requirements)
        if (process.platform === 'linux') {
            log(C.cyan, "SYSTEM", "Detected Linux environment. Checking for SteamCMD dependencies...");
            try {
                log(C.magenta, "DEPS", "Attempting to install SteamCMD and Core dependencies (requires sudo)...");
                // Added libicu-dev, libssl-dev, libkrb5-3 and dotnet-runtime-8.0 for CounterStrikeSharp support
                execSync('sudo apt-get update && sudo apt-get install -y lib32gcc-s1 lib32stdc++6 libc6-i386 lib32z1 libicu-dev libkrb5-3 zlib1g libssl-dev dotnet-runtime-8.0', { stdio: 'inherit' });
                log(C.green, "SUCCESS", "Linux system dependencies are ready.");
            } catch (err) {
                log(C.yellow, "WARNING", "Could not install dependencies automatically.");
                log(C.yellow, "TIP", "Please run: sudo apt-get update && sudo apt-get install -y lib32gcc-s1 lib32stdc++6 libc6-i386 lib32z1");
            }
        }

        // 3. Linux User & Service Configuration (Interactive)
        if (process.platform === 'linux') {
            const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
            const ask = (q) => new Promise(r => rl.question(q, a => r(a)));

            try {
                log(C.cyan, "SETUP", "Starting Linux Server Configuration...");
                
                // 3.1 Create Service User
                const userChoice = await ask(`${C.yellow}[?] Create dedicated 'quatrix' user for security? (Y/n): ${C.reset}`);
                if (userChoice.toLowerCase() !== 'n') {
                    try {
                        execSync('id -u quatrix', { stdio: 'ignore' });
                        log(C.blue, "INFO", "User 'quatrix' already exists.");
                    } catch {
                        log(C.magenta, "USER", "Creating user 'quatrix'...");
                        execSync('sudo useradd -m -s /bin/bash quatrix');
                        execSync('sudo usermod -aG sudo quatrix'); // Optional: Add to sudo for ease of admin
                        log(C.green, "SUCCESS", "User 'quatrix' created.");
                    }

                    // Fix Permissions
                    log(C.magenta, "PERMS", "Fixing project permissions...");
                    const currentDir = process.cwd();
                    execSync(`sudo chown -R quatrix:quatrix ${currentDir}`);
                    execSync(`sudo chmod +x ${path.join(currentDir, 'server/src/services/FileSystemService.ts')}`); // Example check, redundant if chown works
                    log(C.green, "SUCCESS", "Project ownership updated to quatrix:quatrix");
                }

                // 3.2 Systemd Service
                const serviceChoice = await ask(`${C.yellow}[?] Install 'quatrix' as a Systemd service (auto-start)? (Y/n): ${C.reset}`);
                if (serviceChoice.toLowerCase() !== 'n') {
                    log(C.magenta, "SERVICE", "Generating systemd unit file...");
                    const serviceContent = `[Unit]
Description=Quatrix Game Server Manager
After=network.target

[Service]
Type=simple
User=quatrix
WorkingDirectory=${process.cwd()}/server
ExecStart=/usr/bin/npm run start
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target`;

                    fs.writeFileSync('/tmp/quatrix.service', serviceContent);
                    execSync('sudo mv /tmp/quatrix.service /etc/systemd/system/quatrix.service');
                    execSync('sudo systemctl daemon-reload');
                    execSync('sudo systemctl enable quatrix');
                    log(C.green, "SUCCESS", "Service installed & enabled. Start with 'sudo systemctl start quatrix'.");
                }

                // 3.3 Firewall
                const fwChoice = await ask(`${C.yellow}[?] Configure UFW firewall ports (22, 80, 3000, CS2)? (y/N): ${C.reset}`);
                if (fwChoice.toLowerCase() === 'y') {
                    log(C.magenta, "FIREWALL", "Allowing critical ports...");
                    execSync('sudo ufw allow 22/tcp');
                    execSync('sudo ufw allow 80/tcp');
                    execSync('sudo ufw allow 3000/tcp');
                    execSync('sudo ufw allow 27015:27050/udp'); // Game ports
                    execSync('sudo ufw allow 27015:27050/tcp');
                    execSync('sudo ufw --force enable');
                    log(C.green, "SUCCESS", "Firewall configured.");
                }

            } catch (err) {
                log(C.red, "ERROR", `Linux setup step failed: ${err.message}`);
            } finally {
                rl.close();
            }
        }


        // 4. Environment Configuration (.env)
        const rootDir = path.join(__dirname, '..');
        const envPath = path.join(rootDir, '.env');
        const envExamplePath = path.join(rootDir, '.env.example');

        if (!fs.existsSync(envPath)) {
            log(C.magenta, "CONFIG", "Creating .env configuration...");
            if (fs.existsSync(envExamplePath)) {
                let envContent = fs.readFileSync(envExamplePath, 'utf8');
                const randomSecret = crypto.randomBytes(32).toString('hex');
                envContent = envContent.replace('your_super_secret_jwt_key_here_change_this_in_production', randomSecret);
                fs.writeFileSync(envPath, envContent);
                log(C.green, "SUCCESS", "Generated .env with secure JWT_SECRET.");
                log(C.yellow, "NOTE", "Please add your STEAM_API_KEY to .env file");
                log(C.cyan, "INFO", "Get your key from: https://steamcommunity.com/dev/apikey");
            } else {
                throw new Error(".env.example not found!");
            }
        } else {
            log(C.blue, "INFO", ".env already exists, skipping...");
        }

        // 4. Dependency Installation (Faster if only needed)
        const install = (dir, name) => {
            log(C.magenta, "INSTALL", `Installing dependencies for ${C.bright}${name}${C.reset}...`);
            const targetDir = path.join(rootDir, dir);
            
            // Special cleanup for client (Vite cache)
            if (dir === 'client') {
                const viteCache = path.join(targetDir, 'node_modules', '.vite');
                if (fs.existsSync(viteCache)) {
                    log(C.yellow, "CLEAN", "Clearing Vite cache...");
                    fs.rmSync(viteCache, { recursive: true, force: true });
                }
            }

            // check node_modules exists to skip if already installed for speed
            if (fs.existsSync(path.join(targetDir, 'node_modules'))) {
                log(C.blue, "INFO", `${name} already has node_modules. Updating...`);
            }
            execSync('npm install', { cwd: targetDir, stdio: 'inherit' });
            log(C.green, "SUCCESS", `${name} dependencies ready.`);
        };

        install('.', 'Root Project');
        install('server', 'Backend Server');
        install('client', 'Frontend Client');

        // 4. Interactive Final Touch
        console.log(`\n${C.cyan}${C.bright}${"=".repeat(60)}${C.reset}`);
        log(C.green, "COMPLETE", "Quatrix is now fully configured and installed.");
        console.log(`${C.blue}${C.bright}What would you like to do?${C.reset}`);
        console.log(`${C.cyan}1. Exit setup${C.reset}`);
        console.log(`${C.cyan}2. ${C.bright}Launch Battlefield (npm run dev)${C.reset}`);
        console.log(`${C.cyan}${C.bright}${"=".repeat(60)}${C.reset}`);

        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });

        rl.question(`\n${C.yellow}[INPUT] Select an option (1-2): ${C.reset}`, (choice) => {
            rl.close();
            if (choice === '2') {
                console.clear();
                log(C.green, "ACTION", "Launching battlefield... Good luck, soldier!\n");
                // Use spawn to keep the process alive correctly and inherit terminal
                const devProcess = spawn('npm', ['run', 'dev'], { 
                    stdio: 'inherit',
                    shell: true 
                });
                
                devProcess.on('exit', (code) => {
                    process.exit(code || 0);
                });
            } else {
                log(C.blue, "INFO", "Exiting. Use 'npm run dev' to start anytime.");
                process.exit(0);
            }
        });

    } catch (error) {
        log(C.red, "FATAL", `Setup failed: ${error.message}`);
        process.exit(1);
    }
}

runSetup();
