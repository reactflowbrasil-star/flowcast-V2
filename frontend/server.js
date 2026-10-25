// Custom Next.js server with extended timeouts for large file uploads
// This solves the 30-second timeout issue when proxying large files through Next.js rewrites

const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const dev = process.env.NODE_ENV !== 'production';
// Bind all container interfaces. Docker sets HOSTNAME to the container ID,
// which can bind Next to an interface the Coolify proxy does not target.
const hostname = '0.0.0.0';
const port = parseInt(process.env.PORT || '5000', 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
    const server = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    // Extended timeouts for large file uploads (10 minutes)
    // This is the key fix for the 30-second timeout issue
    server.timeout = 600000; // 10 minutes
    server.headersTimeout = 610000; // Slightly more than timeout
    server.requestTimeout = 600000; // 10 minutes
    server.keepAliveTimeout = 65000; // 65 seconds (longer than typical ALB idle timeout)

    server.listen(port, hostname, (err) => {
        if (err) throw err;
        console.log(`> Ready on http://${hostname}:${port}`);
        console.log(`> Server timeouts configured: timeout=${server.timeout}ms, requestTimeout=${server.requestTimeout}ms`);
    });
});

