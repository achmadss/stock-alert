// Configuration
// Use environment-based API URL (production vs development)
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'https://stock-api.achmad.dev';

// State management
const state = {
    allStocks: new Map(), // key: stock name, value: array of updates
    hiddenStocks: new Set(), // Stocks manually hidden from right panel
    eventSource: null, // Single EventSource for all stocks
    reconnectTimer: null,
    isReconnecting: false,
    currentDate: new Date().toDateString() // Track current date for day change detection
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded fired');
    loadHiddenStocksFromStorage();
    setupSearchListeners();

    // Load historical data first
    console.log('About to load historical data');
    await loadHistoricalData();
    console.log('Historical data loaded');

    // Render both panels
    renderAllStocksTable();
    renderFrequentStocksTable();

    // Then connect to real-time updates
    console.log('About to connect to stream');
    connectToStream();

    // Check for day changes every minute
    setInterval(checkDayChangeAndReload, 60000);
});

// Setup search event listeners
function setupSearchListeners() {
    const leftSearchInput = document.getElementById('leftSearchInput');
    const rightSearchInput = document.getElementById('rightSearchInput');

    if (leftSearchInput) {
        leftSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim().toUpperCase();
            filterStockTables('allStocks', searchTerm);
        });
    }

    if (rightSearchInput) {
        rightSearchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim().toUpperCase();
            filterStockTables('frequentStocks', searchTerm);
        });
    }
}

// Filter stock tables by search term
function filterStockTables(containerId, searchTerm) {
    const container = document.getElementById(containerId);
    const stockContainers = container.querySelectorAll('.stock-table-container');

    stockContainers.forEach(stockContainer => {
        const titleElement = stockContainer.querySelector('.stock-table-title');
        if (!titleElement) return;

        const stockName = titleElement.textContent.trim().split('\n')[0].trim();
        if (!searchTerm || stockName.includes(searchTerm)) {
            stockContainer.style.display = '';
        } else {
            stockContainer.style.display = 'none';
        }
    });
}

// Load hidden stocks from localStorage
function loadHiddenStocksFromStorage() {
    const saved = localStorage.getItem('hiddenStocks');
    if (saved) {
        try {
            const hidden = JSON.parse(saved);
            hidden.forEach(stock => state.hiddenStocks.add(stock.toUpperCase()));
        } catch (e) {
            console.error('Error loading hidden stocks:', e);
        }
    }
}

// Save hidden stocks to localStorage
function saveHiddenStocksToStorage() {
    localStorage.setItem('hiddenStocks', JSON.stringify([...state.hiddenStocks]));
}

// Connect to SSE stream for all stocks
function connectToStream() {
    const statusEl = document.getElementById('leftStatus');

    console.log('Attempting to connect to SSE stream:', `${API_BASE_URL}/alert`);

    // Prevent multiple reconnection attempts
    if (state.isReconnecting) {
        console.log('Already reconnecting, skipping...');
        return;
    }

    const eventSource = new EventSource(`${API_BASE_URL}/alert`);
    console.log('EventSource created');

    eventSource.onopen = () => {
        console.log('Connected to stocks stream');
        updateConnectionStatus(statusEl, 'connected');
        state.isReconnecting = false;
    };

    eventSource.onmessage = (event) => {
        try {
            const stockData = JSON.parse(event.data);
            console.log('Received stock update:', stockData);
            handleNewStockUpdate(stockData);
        } catch (error) {
            console.error('Error parsing SSE data:', error);
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        eventSource.close();
        updateConnectionStatus(statusEl, 'error');

        // Attempt to reconnect after 5 seconds
        if (!state.isReconnecting) {
            state.isReconnecting = true;
            state.reconnectTimer = setTimeout(() => {
                console.log('Attempting to reconnect...');
                connectToStream();
            }, 5000);
        }
    };

    state.eventSource = eventSource;
}

// Load historical data on page load
async function loadHistoricalData() {
    const statusEl = document.getElementById('leftStatus');
    updateConnectionStatus(statusEl, 'connecting');

    try {
        // Load all historical data for today (no pagination needed since it's just today's data)
        const url = `${API_BASE_URL}/history?limit=1000`;
        console.log('Fetching historical data from:', url);
        const response = await fetch(url);
        console.log('History response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('History data received, count:', data.trading_plans?.length || 0);

        // Process historical data - group by stock name
        data.trading_plans.forEach(plan => {
            const stockName = plan.name.toUpperCase();

            if (!state.allStocks.has(stockName)) {
                state.allStocks.set(stockName, []);
            }

            // Add to stock list (check for duplicates by message_id)
            const existing = state.allStocks.get(stockName).find(
                item => item.message_id === plan.message_id
            );
            if (!existing) {
                state.allStocks.get(stockName).push(plan);
            }
        });

        // Sort each stock's updates by datetime descending
        state.allStocks.forEach((updates, stockName) => {
            updates.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));
        });

        // Update status to show we're ready for real-time
        const statusText = statusEl.querySelector('.status-text');
        statusText.textContent = 'Connecting to live stream...';
    } catch (error) {
        console.error('Error loading historical data:', error);
        updateConnectionStatus(statusEl, 'error');
    }
}

// Handle new stock update from SSE stream
async function handleNewStockUpdate(stockData) {
    const stockName = stockData.name.toUpperCase();

    // Add to all stocks map
    if (!state.allStocks.has(stockName)) {
        state.allStocks.set(stockName, []);
    }

    // Check for duplicates using message_id
    const existing = state.allStocks.get(stockName).find(
        item => item.message_id === stockData.message_id
    );
    if (existing) {
        console.log(`Duplicate message_id ${stockData.message_id} - skipping render`);
        return;
    }

    state.allStocks.get(stockName).unshift(stockData);

    // Re-render both panels
    renderAllStocksTable();
    renderFrequentStocksTable();
}

// Check for day change and reload data if needed
async function checkDayChangeAndReload() {
    const newDate = new Date().toDateString();
    if (newDate !== state.currentDate) {
        console.log('Day changed, reloading historical data');
        state.currentDate = newDate;
        state.allStocks.clear();
        await loadHistoricalData();
        renderAllStocksTable();
        renderFrequentStocksTable();
    }
}

// Hide a stock from the right panel
function hideStock(stockName) {
    state.hiddenStocks.add(stockName);
    saveHiddenStocksToStorage();
    renderFrequentStocksTable();
}

// Update connection status indicator
function updateConnectionStatus(statusEl, status) {
    const dot = statusEl.querySelector('.status-dot');
    const text = statusEl.querySelector('.status-text');

    dot.className = 'status-dot';

    switch (status) {
        case 'connected':
            dot.classList.add('connected');
            text.textContent = 'Connected';
            break;
        case 'connecting':
            text.textContent = 'Connecting...';
            break;
        case 'error':
            dot.classList.add('error');
            text.textContent = 'Disconnected';
            break;
    }
}

// Format datetime for display
function formatDateTime(datetimeStr) {
    const date = new Date(datetimeStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) {
        return 'Just now';
    } else if (diffMins < 60) {
        return `${diffMins} min${diffMins > 1 ? 's' : ''} ago`;
    } else {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }
}

// Calculate buy value trend
function getBuyTrend(currentBuy, previousBuy) {
    if (!previousBuy || !currentBuy || currentBuy.length === 0 || previousBuy.length === 0) {
        return null;
    }

    // Compare the first buy value (primary buy point)
    const currentValue = currentBuy[0];
    const previousValue = previousBuy[0];

    if (currentValue > previousValue) {
        return 'up';
    } else if (currentValue < previousValue) {
        return 'down';
    }
    return null;
}

// Render trend indicator
function renderTrendIndicator(trend) {
    if (trend === 'up') {
        return '<span class="trend-indicator up">↗</span>';
    } else if (trend === 'down') {
        return '<span class="trend-indicator down">↘</span>';
    }
    return '';
}

// Format array as range (e.g., [103, 102, 101, 100] => "103-100")
function formatRange(arr) {
    if (!arr || arr.length === 0) return '';
    if (arr.length === 1) return arr[0].toString();
    return `${arr[0]}-${arr[arr.length - 1]}`;
}

// Create stock table for showing all updates
function createStockTable(updates, stockName, showRemoveButton = false) {
    // Create table rows with single trend indicator column
    const rows = updates.map((update, index) => {
        // Get previous update for comparison (if available)
        const prevUpdate = index < updates.length - 1 ? updates[index + 1] : null;

        // Calculate overall trend based on buy value
        const buyTrend = prevUpdate ? getBuyTrend(update.buy, prevUpdate.buy) : null;
        const trendHTML = buyTrend ? renderTrendIndicator(buyTrend) : '<span class="trend-indicator">—</span>';

        return `
            <tr>
                <td class="trend-cell">${trendHTML}</td>
                <td>${formatRange(update.buy)}</td>
                <td>${formatRange(update.tp)}</td>
                <td>${update.sl}</td>
                <td class="update-time">${formatDateTime(update.datetime)}</td>
            </tr>
        `;
    }).join('');

    const expandButtonHTML = showRemoveButton
        ? `<button class="expand-stock" onclick="showStockModal('${stockName}')" title="Show details">⛶</button>`
        : '';

    const removeButtonHTML = showRemoveButton
        ? `<button class="remove-stock" onclick="hideStock('${stockName}')" title="Remove from panel">×</button>`
        : '';

    return `
        <div class="stock-table-container">
            <div class="stock-table-header">
                <div class="stock-table-title">
                    ${stockName}
                    <span class="update-count">${updates.length}</span>
                </div>
                ${expandButtonHTML}
                ${removeButtonHTML}
            </div>
            <div class="stock-table-wrapper">
                <table class="stock-table">
                    <thead>
                        <tr>
                            <th class="trend-header"></th>
                            <th>BUY</th>
                            <th>TP</th>
                            <th>SL</th>
                            <th>TIME</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Render all stocks table in left panel
function renderAllStocksTable() {
    const container = document.getElementById('allStocks');

    if (state.allStocks.size === 0) {
        container.innerHTML = '<div class="empty-state"><p>Waiting for stock updates...</p></div>';
        return;
    }

    // Sort stocks by latest update time
    const sortedStocks = [...state.allStocks.entries()].sort((a, b) => {
        const latestA = new Date(a[1][0].datetime);
        const latestB = new Date(b[1][0].datetime);
        return latestB - latestA;
    });

    const html = sortedStocks.map(([stockName, updates]) =>
        createStockTable(updates, stockName, false)
    ).join('');

    container.innerHTML = html;
}

// Render frequent stocks table in right panel (3+ updates, not hidden)
function renderFrequentStocksTable() {
    const container = document.getElementById('frequentStocks');

    // Filter stocks with 3 or more updates and not hidden
    const frequentStocks = [...state.allStocks.entries()]
        .filter(([stockName, updates]) =>
            updates.length >= 3 && !state.hiddenStocks.has(stockName)
        )
        .sort((a, b) => {
            // Sort by update count descending, then by latest update time
            if (b[1].length !== a[1].length) {
                return b[1].length - a[1].length;
            }
            const latestA = new Date(a[1][0].datetime);
            const latestB = new Date(b[1][0].datetime);
            return latestB - latestA;
        });

    if (frequentStocks.length === 0) {
        container.innerHTML = '<div class="empty-state"><p>No stocks with 3+ updates yet</p></div>';
        return;
    }

    const html = frequentStocks.map(([stockName, updates]) =>
        createStockTable(updates, stockName, true)
    ).join('');

    container.innerHTML = html;
}

// Show detailed stock modal
function showStockModal(stockName) {
    const updates = state.allStocks.get(stockName.toUpperCase());
    if (!updates) return;

    const modal = document.getElementById('stockModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');

    modalTitle.textContent = `${stockName} - All Updates (${updates.length})`;

    // Create detailed table
    const tableHTML = `
        <table class="stock-table">
            <thead>
                <tr>
                    <th class="trend-header"></th>
                    <th>BUY</th>
                    <th>TP</th>
                    <th>SL</th>
                    <th>TIME</th>
                </tr>
            </thead>
            <tbody>
                ${updates.map((update, index) => {
                    const prevUpdate = index < updates.length - 1 ? updates[index + 1] : null;
                    const buyTrend = prevUpdate ? getBuyTrend(update.buy, prevUpdate.buy) : null;
                    const trendHTML = buyTrend ? renderTrendIndicator(buyTrend) : '<span class="trend-indicator">—</span>';

                    return `
                        <tr>
                            <td class="trend-cell">${trendHTML}</td>
                            <td>${update.buy.join(', ')}</td>
                            <td>${update.tp.join(', ')}</td>
                            <td>${update.sl}</td>
                            <td class="update-time">${formatDateTime(update.datetime)}</td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;

    modalBody.innerHTML = tableHTML;
    modal.style.display = 'block';
}

// Close stock modal
function closeStockModal() {
    const modal = document.getElementById('stockModal');
    modal.style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('stockModal');
    if (event.target === modal) {
        closeStockModal();
    }
}

// Make functions globally accessible
window.hideStock = hideStock;
window.showStockModal = showStockModal;
window.closeStockModal = closeStockModal;
