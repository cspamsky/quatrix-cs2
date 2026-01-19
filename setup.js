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
        
        // 2. Secret Generation (.env)
        const serverEnvPath = path.join(__dirname, 'server', '.env');
        const serverEnvExamplePath = path.join(__dirname, 'server', '.env.example');

        if (!fs.existsSync(serverEnvPath)) {
            log(C.magenta, "CONFIG", "Creating server/.env configuration...");
            if (fs.existsSync(serverEnvExamplePath)) {
                let envContent = fs.readFileSync(serverEnvExamplePath, 'utf8');
                const randomSecret = crypto.randomBytes(32).toString('hex');
                envContent = envContent.replace('your_super_secret_jwt_key_here', randomSecret);
                fs.writeFileSync(serverEnvPath, envContent);
                log(C.green, "SUCCESS", "Generated server/.env with secure JWT_SECRET.");
            } else {
                throw new Error("server/.env.example not found!");
            }
        } else {
            log(C.blue, "INFO", "server/.env already exists, skipping...");
        }

        // 3. Dependency Installation (Faster if only needed)
        const install = (dir, name) => {
            log(C.magenta, "INSTALL", `Installing dependencies for ${C.bright}${name}${C.reset}...`);
            const targetDir = path.join(__dirname, dir);
            
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
