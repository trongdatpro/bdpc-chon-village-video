const fs = require('fs');

try {
    const content = fs.readFileSync('.env', 'utf-8');
    const lines = content.split(/\r?\n/);
    lines.forEach((line, i) => {
        if (!line.trim()) return;
        const [key, value] = line.split('=');
        if (value) {
            console.log(`Line ${i+1}: ${key} | Length: ${value.length} | Ends with space: ${value.endsWith(' ')}`);
            // Check for invisible characters
            const hex = Buffer.from(value, 'utf-8').toString('hex');
            console.log(`   Hex: ${hex.slice(0, 10)}...${hex.slice(-10)}`);
        }
    });
} catch (e) {
    console.error('Error reading .env:', e.message);
}
