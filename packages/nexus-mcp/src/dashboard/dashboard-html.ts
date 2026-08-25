/**
 * Standalone Web Dashboard HTML Template
 * Renders a modern, dark-themed developer dashboard using Tailwind CSS and native EventSource.
 */

export function renderDashboardHtml(): string {
  return `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ NexusMCP — Intelligent Agent Gateway Dashboard</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: { 500: '#6366f1', 600: '#4f46e5', 700: '#4338ca' }
          }
        }
      }
    }
  </script>
  <style>
    body { background-color: #0b0f19; color: #e2e8f0; font-family: system-ui, -apple-system, sans-serif; }
    .glass-card { background: rgba(17, 24, 39, 0.7); backdrop-filter: blur(12px); border: 1px solid rgba(255, 255, 255, 0.08); }
    .badge-heal { background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
    .badge-loop { background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); }
    .badge-cache { background: rgba(59, 130, 246, 0.2); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
  </style>
</head>
<body class="min-h-screen p-6">
  <div class="max-w-7xl mx-auto space-y-6">
    <!-- Header -->
    <header class="flex items-center justify-between glass-card p-5 rounded-2xl">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-xl font-bold shadow-lg shadow-indigo-500/20">
          ⚡
        </div>
        <div>
          <h1 class="text-xl font-bold text-white flex items-center gap-2">
            NexusMCP Gateway
            <span class="text-xs font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">Live Connected</span>
          </h1>
          <p class="text-xs text-gray-400">Model Context Protocol • Self-Healing & Token Optimization Proxy</p>
        </div>
      </div>
      <div class="flex items-center gap-4">
        <div id="connection-status" class="flex items-center gap-2 text-xs text-emerald-400 font-medium">
          <span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> SSE Streaming
        </div>
      </div>
    </header>

    <!-- Top KPI Grid -->
    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      <div class="glass-card p-5 rounded-xl">
        <div class="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Invocations</div>
        <div id="stat-total" class="text-3xl font-extrabold text-white mt-1">0</div>
        <div class="text-xs text-gray-500 mt-2">All proxy calls processed</div>
      </div>
      <div class="glass-card p-5 rounded-xl">
        <div class="text-xs font-semibold text-emerald-400 uppercase tracking-wider">Auto-Healed Calls</div>
        <div id="stat-healed" class="text-3xl font-extrabold text-emerald-400 mt-1">0</div>
        <div class="text-xs text-emerald-500/80 mt-2">Prevented failure with $0 added cost</div>
      </div>
      <div class="glass-card p-5 rounded-xl">
        <div class="text-xs font-semibold text-indigo-400 uppercase tracking-wider">Tokens Saved</div>
        <div id="stat-tokens" class="text-3xl font-extrabold text-indigo-400 mt-1">0</div>
        <div class="text-xs text-indigo-500/80 mt-2">Distillation & pruning savings</div>
      </div>
      <div class="glass-card p-5 rounded-xl">
        <div class="text-xs font-semibold text-amber-400 uppercase tracking-wider">Estimated ROI ($ Saved)</div>
        <div id="stat-money" class="text-3xl font-extrabold text-amber-400 mt-1">$0.0000</div>
        <div class="text-xs text-amber-500/80 mt-2">Based on Claude 3.5 / GPT-4o rates</div>
      </div>
    </div>

    <!-- Live Invocations Stream Table -->
    <div class="glass-card rounded-2xl p-5 overflow-hidden">
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          <span>📡 Real-Time Agent Tool Invocation Feed</span>
        </h2>
        <button onclick="clearTable()" class="text-xs text-gray-400 hover:text-white px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded-lg transition">Clear Feed</button>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-xs">
          <thead class="text-gray-400 uppercase bg-gray-900/50 border-b border-gray-800">
            <tr>
              <th class="p-3">Timestamp</th>
              <th class="p-3">Tool Name</th>
              <th class="p-3">Status</th>
              <th class="p-3">Healing / Action</th>
              <th class="p-3">Tokens In / Out</th>
              <th class="p-3">Latency</th>
            </tr>
          </thead>
          <tbody id="events-body" class="divide-y divide-gray-800/60 font-mono">
            <tr id="empty-row" class="text-gray-500 text-center">
              <td colspan="6" class="p-6">Waiting for agent tool calls... Connect Claude Desktop or send request to /invoke</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script>
    let totalCalls = 0;
    let healedCalls = 0;
    let tokensSaved = 0;

    async function loadInitialStats() {
      try {
        const res = await fetch('/metrics');
        const data = await res.json();
        if (data && data.stats) {
          totalCalls = data.stats.totalInvocations;
          healedCalls = data.stats.healedInvocations;
          tokensSaved = data.stats.totalTokensSaved;
          updateKpis(data.stats.estimatedCostSavedUsd);
        }
      } catch (err) {}
    }

    function updateKpis(costUsd) {
      document.getElementById('stat-total').innerText = totalCalls.toLocaleString();
      document.getElementById('stat-healed').innerText = healedCalls.toLocaleString();
      document.getElementById('stat-tokens').innerText = tokensSaved.toLocaleString();
      const money = costUsd !== undefined ? costUsd : (tokensSaved / 1000) * 0.003;
      document.getElementById('stat-money').innerText = '$' + money.toFixed(4);
    }

    function connectSSE() {
      const evtSource = new EventSource('/events/live-stream');
      
      evtSource.onmessage = (e) => {
        const item = JSON.parse(e.data);
        const emptyRow = document.getElementById('empty-row');
        if (emptyRow) emptyRow.remove();

        totalCalls++;
        if (item.wasHealed) healedCalls++;
        tokensSaved += item.tokensSaved || 0;
        updateKpis();

        const tbody = document.getElementById('events-body');
        const tr = document.createElement('tr');
        tr.className = 'hover:bg-gray-800/40 transition';

        let badge = '<span class="px-2 py-0.5 rounded text-[10px] bg-emerald-500/20 text-emerald-400">Success</span>';
        if (item.isError) badge = '<span class="px-2 py-0.5 rounded text-[10px] bg-rose-500/20 text-rose-400">Error</span>';
        if (item.isLoop) badge = '<span class="px-2 py-0.5 rounded text-[10px] bg-red-500/30 text-red-400 font-bold">Loop Blocked</span>';
        if (item.isCacheHit) badge = '<span class="px-2 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400">Cache Hit</span>';

        let healInfo = '<span class="text-gray-500">-</span>';
        if (item.wasHealed) {
          healInfo = \`<span class="badge-heal px-2 py-0.5 rounded font-semibold text-[11px]">⚡ Healed (\${item.healedModifications?.length || 1} fields)</span>\`;
        }

        tr.innerHTML = \`
          <td class="p-3 text-gray-400">\${item.timestamp.split('T')[1]?.slice(0, 8) || item.timestamp}</td>
          <td class="p-3 font-semibold text-indigo-300">\${item.toolName}</td>
          <td class="p-3">\${badge}</td>
          <td class="p-3">\${healInfo}</td>
          <td class="p-3 text-gray-300">\${item.rawTokens} &rarr; \${item.distilledTokens} <span class="text-emerald-400">(-\${item.tokensSaved})</span></td>
          <td class="p-3 text-gray-400">\${item.durationMs.toFixed(1)}ms</td>
        \`;

        tbody.insertBefore(tr, tbody.firstChild);
      };
    }

    function clearTable() {
      document.getElementById('events-body').innerHTML = '<tr id="empty-row" class="text-gray-500 text-center"><td colspan="6" class="p-6">Feed cleared. Waiting for new calls...</td></tr>';
    }

    loadInitialStats();
    connectSSE();
  </script>
</body>
</html>`;
}
