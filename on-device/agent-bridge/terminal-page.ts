/**
 * Terminal page HTML for the Under Hood viewer.
 * Loads ghostty-web from CDN and connects to /terminal/ws for task streaming.
 */

export function getTerminalHTML(wsPort: number): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agent Terminal</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: #000000;
      overflow: hidden;
    }
    #terminal-container {
      width: 100%;
      height: 100%;
      background: #000000;
    }
    .loading {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      color: #00ff41;
      font-family: 'Monaco', 'Menlo', 'Courier New', monospace;
      font-size: 14px;
    }
    .loading::after {
      content: '█';
      animation: blink 1s step-start infinite;
    }
    @keyframes blink {
      50% { opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="terminal-container">
    <div class="loading">Initializing terminal</div>
  </div>

  <script type="module">
    import { init, Terminal } from 'https://esm.sh/ghostty-web@0.1.8';

    let term;
    let ws;
    let reconnectTimer;

    async function initTerminal() {
      const container = document.getElementById('terminal-container');

      try {
        await init();

        container.innerHTML = '';

        term = new Terminal({
          cursorBlink: true,
          fontSize: 13,
          fontFamily: '"SF Mono", Monaco, Menlo, "Courier New", monospace',
          theme: {
            background: '#000000',
            foreground: '#00ff41',
            cursor: '#00ff41',
            cursorAccent: '#000000',
            selectionBackground: '#00ff4140',
          },
          scrollback: 50000,
        });

        term.open(container);

        // Fit terminal to container
        const fit = () => {
          const dims = term.proposeDimensions();
          if (dims) {
            term.resize(dims.cols, dims.rows);
          }
        };
        fit();
        window.addEventListener('resize', fit);

        // Connect to agent-bridge WebSocket
        connectWebSocket();

        // Display welcome message
        term.write('\\x1b[1;32m╔════════════════════════════════════════════════════════════╗\\r\\n');
        term.write('║              AGENT BRIDGE TERMINAL                         ║\\r\\n');
        term.write('║   Real-time view of agent task execution                  ║\\r\\n');
        term.write('╚════════════════════════════════════════════════════════════╝\\x1b[0m\\r\\n\\r\\n');
        term.write('\\x1b[33mWaiting for tasks...\\x1b[0m\\r\\n\\r\\n');

      } catch (err) {
        console.error('Failed to initialize terminal:', err);
        container.innerHTML = '<div class="loading" style="color: #ff4444;">Failed to load terminal: ' + err.message + '</div>';
      }
    }

    function connectWebSocket() {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = protocol + '//' + window.location.host + '/terminal/ws';

      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Terminal] WebSocket connected');
        if (term) {
          term.write('\\x1b[32m[CONNECTED]\\x1b[0m WebSocket connection established\\r\\n');
        }
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
      };

      ws.onmessage = (event) => {
        if (!term) return;

        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'task':
              // New task received
              term.write('\\r\\n\\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\x1b[0m\\r\\n');
              term.write('\\x1b[1;33m[TASK]\\x1b[0m ' + new Date().toLocaleTimeString() + '\\r\\n');
              term.write('\\x1b[1;37mAgent:\\x1b[0m ' + (data.agent || 'unknown') + '\\r\\n');
              term.write('\\x1b[1;37mTask:\\x1b[0m ' + data.content + '\\r\\n');
              term.write('\\x1b[1;36m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\\x1b[0m\\r\\n\\r\\n');
              break;

            case 'status':
              // Task status update
              const statusColor = {
                'running': '33',    // yellow
                'completed': '32',  // green
                'error': '31',      // red
              }[data.status] || '37';
              term.write('\\x1b[' + statusColor + 'm[' + data.status.toUpperCase() + ']\\x1b[0m ' + data.message + '\\r\\n');
              if (data.progress !== undefined) {
                const bar = '█'.repeat(Math.floor(data.progress / 5)) + '░'.repeat(20 - Math.floor(data.progress / 5));
                term.write('\\x1b[90mProgress: [' + bar + '] ' + data.progress + '%\\x1b[0m\\r\\n');
              }
              break;

            case 'output':
              // Raw output from agent
              term.write(data.content);
              break;

            case 'log':
              // Log message
              term.write('\\x1b[90m' + data.content + '\\x1b[0m\\r\\n');
              break;

            case 'clear':
              term.clear();
              term.write('\\x1b[33mTerminal cleared\\x1b[0m\\r\\n\\r\\n');
              break;

            default:
              // Raw text fallback
              term.write(event.data + '\\r\\n');
          }
        } catch {
          // Plain text message
          term.write(event.data + '\\r\\n');
        }
      };

      ws.onerror = (error) => {
        console.error('[Terminal] WebSocket error:', error);
      };

      ws.onclose = () => {
        console.log('[Terminal] WebSocket disconnected');
        if (term) {
          term.write('\\r\\n\\x1b[31m[DISCONNECTED]\\x1b[0m Connection lost, reconnecting...\\r\\n');
        }
        // Reconnect after 2 seconds
        reconnectTimer = setTimeout(connectWebSocket, 2000);
      };
    }

    // Initialize on load
    initTerminal();
  </script>
</body>
</html>`;
}
