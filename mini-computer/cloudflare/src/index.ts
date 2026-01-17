import { Container, getContainer, getRandom } from "@cloudflare/containers";
import { Hono } from "hono";

export class MyContainer extends Container<Env> {
	// Port the container listens on (default: 8080)
	defaultPort = 8080;
	// Time before container sleeps due to inactivity (default: 30s)
	sleepAfter = "2m";
	// Environment variables passed to the container
	envVars = {
		MESSAGE: "I was passed in via the container class!",
	};

	// Optional lifecycle hooks
	override onStart() {
		console.log("Container successfully started");
	}

	override onStop() {
		console.log("Container successfully shut down");
	}

	override onError(error: unknown) {
		console.log("Container error:", error);
	}
}

// Create Hono app with proper typing for Cloudflare Workers
const app = new Hono<{
	Bindings: Env;
}>();

// Home route with available endpoints
app.get("/", (c) => {
	return c.text(
		"Available endpoints:\n" +
			"GET /container/<ID> - Start a container for each ID with a 2m timeout\n" +
			"GET /lb - Load balance requests over multiple containers\n" +
			"GET /error - Start a container that errors (demonstrates error handling)\n" +
			"GET /singleton - Get a single specific container instance",
	);
});

// Route requests to a specific container using the container ID
app.get("/container/:id", async (c) => {
	const id = c.req.param("id");
	const containerId = c.env.MY_CONTAINER.idFromName(`/container/${id}`);
	const container = c.env.MY_CONTAINER.get(containerId);
	return await container.fetch(c.req.raw);
});

// Start a container and return immediately (don't wait for port)
app.post("/container/:id/start", async (c) => {
	const id = c.req.param("id");
	const containerId = c.env.MY_CONTAINER.idFromName(`/container/${id}`);
	const container = c.env.MY_CONTAINER.get(containerId);
	
	// Trigger container start by fetching a lightweight endpoint
	// The container will start in the background
	container.fetch(new Request("http://internal/health")).catch(() => {});
	
	return c.json({ 
		success: true, 
		containerId: id,
		message: "Container starting, use /container/:id/status to check readiness" 
	});
});

// Check container status without blocking
app.get("/container/:id/status", async (c) => {
	const id = c.req.param("id");
	const containerId = c.env.MY_CONTAINER.idFromName(`/container/${id}`);
	const container = c.env.MY_CONTAINER.get(containerId);
	
	try {
		const response = await container.fetch(new Request("http://internal/health"));
		if (response.ok) {
			return c.json({ status: "ready", containerId: id });
		}
		return c.json({ status: "starting", containerId: id });
	} catch {
		return c.json({ status: "starting", containerId: id });
	}
});

// Container-specific VNC desktop viewer
app.get("/container/:id/desktop", async (c) => {
	const id = c.req.param("id");
	const basePath = `/container/${id}`;
	
	return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Mini Computer</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { background: #1a1a2e; height: 100vh; display: flex; flex-direction: column; }
        .header { padding: 8px 16px; background: #16213e; color: #fff; display: flex; align-items: center; gap: 12px; }
        .status { padding: 4px 12px; border-radius: 12px; font-size: 12px; }
        .status.connecting { background: #f59e0b; color: #000; }
        .status.connected { background: #10b981; color: #000; }
        .status.error { background: #ef4444; color: #fff; }
        #vnc-screen { flex: 1; background: #000; }
    </style>
</head>
<body>
    <div class="header">
        <span>🖥️ Mini Computer</span>
        <span class="status connecting" id="status">Connecting...</span>
    </div>
    <div id="vnc-screen"></div>
    <script type="module">
        const id = "${id}";
        const basePath = "${basePath}";
        const RFBModule = await import(basePath + '/core/rfb.js');
        const RFB = RFBModule.default;
        const statusEl = document.getElementById('status');
        
        function connect() {
            const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl = protocol + '://' + location.host + basePath + '/websockify';
            statusEl.textContent = 'Connecting...';
            statusEl.className = 'status connecting';
            
            try {
                const rfb = new RFB(document.getElementById('vnc-screen'), wsUrl, {
                    scaleViewport: true,
                    resizeSession: true
                });
                rfb.addEventListener('connect', () => {
                    statusEl.textContent = 'Connected';
                    statusEl.className = 'status connected';
                });
                rfb.addEventListener('disconnect', () => {
                    statusEl.textContent = 'Disconnected';
                    statusEl.className = 'status error';
                    setTimeout(connect, 3000);
                });
            } catch (e) {
                statusEl.textContent = 'Error: ' + e.message;
                statusEl.className = 'status error';
                setTimeout(connect, 3000);
            }
        }
        connect();
    </script>
</body>
</html>
	`);
});

// Container-specific WebSocket proxy
app.all("/container/:id/websockify", async (c) => {
	const id = c.req.param("id");
	const containerId = c.env.MY_CONTAINER.idFromName(`/container/${id}`);
	const container = c.env.MY_CONTAINER.get(containerId);
	return await container.fetch(c.req.raw);
});

// Container-specific noVNC static files
app.get("/container/:id/core/*", async (c) => {
	const id = c.req.param("id");
	const containerId = c.env.MY_CONTAINER.idFromName(`/container/${id}`);
	const container = c.env.MY_CONTAINER.get(containerId);
	// Rewrite path to strip container prefix
	const url = new URL(c.req.url);
	const newPath = url.pathname.replace(`/container/${id}`, "");
	const newUrl = new URL(newPath, url.origin);
	return await container.fetch(new Request(newUrl.toString(), c.req.raw));
});

app.get("/container/:id/vendor/*", async (c) => {
	const id = c.req.param("id");
	const containerId = c.env.MY_CONTAINER.idFromName(`/container/${id}`);
	const container = c.env.MY_CONTAINER.get(containerId);
	const url = new URL(c.req.url);
	const newPath = url.pathname.replace(`/container/${id}`, "");
	const newUrl = new URL(newPath, url.origin);
	return await container.fetch(new Request(newUrl.toString(), c.req.raw));
});

// Demonstrate error handling - this route forces a panic in the container
app.get("/error", async (c) => {
	const container = getContainer(c.env.MY_CONTAINER, "error-test");
	return await container.fetch(c.req.raw);
});

// Load balance requests across multiple containers
app.get("/lb", async (c) => {
	const container = await getRandom(c.env.MY_CONTAINER, 3);
	return await container.fetch(c.req.raw);
});

// Get a single container instance (singleton pattern)
app.get("/singleton", async (c) => {
	const container = getContainer(c.env.MY_CONTAINER);
	return await container.fetch(c.req.raw);
});

// WebSocket proxy to container's noVNC (bypasses worker, connects directly)
app.all("/websockify", async (c) => {
	const container = getContainer(c.env.MY_CONTAINER, "vnc");
	return await container.fetch(c.req.raw);
});

// Serve noVNC static files from container (paths passed directly - websockify serves from --web root)
app.get("/core/*", async (c) => {
	const container = getContainer(c.env.MY_CONTAINER, "vnc");
	return await container.fetch(c.req.raw);
});

app.get("/vendor/*", async (c) => {
	const container = getContainer(c.env.MY_CONTAINER, "vnc");
	return await container.fetch(c.req.raw);
});

// Desktop VNC - serve the web interface
app.get("/desktop", async (c) => {
	return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Desktop VNC (ESM)</title>
    <style>
        body {
            margin: 0;
            padding: 20px;
            background: #2b2b2b;
            font-family: sans-serif;
        }
        #vnc-container {
            max-width: 1400px;
            margin: 0 auto;
            background: #1e1e1e;
            border-radius: 8px;
            padding: 20px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        }
        h1 {
            color: #fff;
            margin-top: 0;
        }
        .info {
            color: #aaa;
            margin-bottom: 20px;
            font-size: 14px;
            display: flex;
            justify-content: space-between;
        }
        .status {
            padding: 10px;
            background: #333;
            border-radius: 4px;
            margin-bottom: 15px;
            color: #aaa;
            font-size: 14px;
        }
        .status.connected {
            color: #4ade80;
            background: #1a4128;
            border: 1px solid #4ade80;
        }
        .status.error {
            color: #ef4444;
            background: #451a1a;
            border: 1px solid #ef4444;
        }
        #vnc-screen {
            border: 1px solid #444;
            border-radius: 4px;
            width: 100%;
            background: #000;
            min-height: 600px;
        }
        button {
            padding: 8px 16px;
            border-radius: 4px;
            border: none;
            cursor: pointer;
            background: #4f46e5;
            color: white;
            font-weight: bold;
        }
        button:hover {
            background: #4338ca;
        }
    </style>
</head>
<body>
    <div id="vnc-container">
        <h1>🖥️ Desktop Environment</h1>
        <div class="info">
            <span>VNC Web Viewer (ESM)</span>
            <button onclick="window.location.reload()">Force Reload</button>
        </div>
        <div class="status" id="status">⏳ Initializing...</div>
        <div id="vnc-screen"></div>
    </div>
    
    <script type="module">
        const RFBModule = await import('/core/rfb.js');
        const RFB = RFBModule.default;

        const screenEl = document.getElementById('vnc-screen');
        const statusEl = document.getElementById('status');
        
        function connect() {
            const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
            const wsUrl = protocol + '://' + window.location.host + '/websockify';
            
            console.log('Connecting to VNC at:', wsUrl);
            statusEl.textContent = '⏳ Connecting to ' + wsUrl + '...';
            statusEl.className = 'status';
            
            try {
                const rfb = new RFB(screenEl, wsUrl, {
                    scaleViewport: true,
                    resizeSession: true
                });
                
                rfb.addEventListener('connect', () => {
                    statusEl.textContent = '✓ Connected to Desktop';
                    statusEl.className = 'status connected';
                    console.log('VNC Connected');
                });
                
                rfb.addEventListener('disconnect', (e) => {
                    statusEl.textContent = '✗ Disconnected (Clean: ' + e.detail.clean + ')';
                    statusEl.className = 'status error';
                    console.log('VNC Disconnected', e.detail);
                });
                
                rfb.addEventListener('credentialsrequired', () => {
                    statusEl.textContent = '🔒 Password Required';
                    statusEl.className = 'status error';
                });
                
                rfb.addEventListener('securityfailure', (e) => {
                    statusEl.textContent = '🔒 Security Failure: ' + JSON.stringify(e.detail);
                    statusEl.className = 'status error';
                });
                
                rfb.addEventListener('error', (e) => {
                    console.error('VNC Error:', e);
                    statusEl.textContent = '✗ Connection Error';
                    statusEl.className = 'status error';
                });
            } catch (e) {
                console.error('Failed to create RFB:', e);
                statusEl.textContent = '✗ Client Error: ' + e.message;
                statusEl.className = 'status error';
            }
        }
        
        // Start connection
        connect();
    </script>
</body>
</html>
	`);
});

export default app;
