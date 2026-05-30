import http from 'http';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

// Create a simple static file server
const server = http.createServer((req, res) => {
    let urlPath = req.url.split('?')[0];
    if (urlPath === '/' || urlPath === '') {
        urlPath = '/index.html';
    }
    
    const filePath = path.join('c:/Users/okemo/Desktop/Projects/web', urlPath);
    const extname = String(path.extname(filePath)).toLowerCase();
    const mimeTypes = {
        '.html': 'text/html',
        '.js': 'text/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.jpg': 'image/jpg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.ttf': 'font/ttf',
        '.woff': 'font/woff',
        '.woff2': 'font/woff2'
    };

    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('404 Not Found: ' + filePath, 'utf-8');
        } else {
            res.writeHead(200, { 'Content-Type': contentType });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(3000, async () => {
    console.log('Server running at http://localhost:3000/');

    const browser = await chromium.launch();
    const page = await browser.newPage();

    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error));

    try {
        await page.goto('http://localhost:3000/word/index.html');
        console.log('Loaded word/index.html');

        // Test export menu button click
        console.log('Testing export button click...');
        const exportBtn = page.locator('button[title="Export"]');
        await exportBtn.click();
        
        // Wait a bit and check display of export-menu
        const isMenuVisible = await page.evaluate(() => {
            const menu = document.getElementById('export-menu');
            return menu && window.getComputedStyle(menu).display !== 'none';
        });
        console.log('Is export menu visible after click?', isMenuVisible);

        // Test theme button click
        console.log('Testing theme button click...');
        const themeBtn = page.locator('#theme-btn');
        await themeBtn.click();
        console.log('Clicked theme button');

        // Test save button click
        console.log('Testing save button click...');
        const saveBtn = page.locator('#save-btn');
        await saveBtn.click();
        console.log('Clicked save button');
        
    } catch(e) {
        console.error('Error during automation:', e);
    } finally {
        await browser.close();
        server.close();
        console.log('Server closed');
    }
});
