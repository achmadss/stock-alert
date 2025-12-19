// Configuration
// Use environment-based API URL (production vs development)
const API_BASE_URL = window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : 'https://stock-api.achmad.dev';

// State management
const state = {
    allStocks: new Map(), // key: stock name, value: array of updates
    favorites: new Set(),
    favoriteUpdates: new Map(), // key: stock name, value: array of latest 2 updates
    eventSources: new Map(), // key: stock name, value: EventSource
    reconnectTimers: new Map(), // key: connection name, value: timeout ID
    isReconnecting: new Map(), // key: connection name, value: boolean
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    loadFavoritesFromStorage();
    connectToAllStocksStream();
    setupEventListeners();
    renderFavorites();
});

// Load favorites from localStorage
function loadFavoritesFromStorage() {
    const saved = localStorage.getItem('favorites');
    if (saved) {
        try {
            const favorites = JSON.parse(saved);
            favorites.forEach(stock => state.favorites.add(stock.toUpperCase()));
        } catch (e) {
            console.error('Error loading favorites:', e);
        }
    }
}

// Save favorites to localStorage
function saveFavoritesToStorage() {
    localStorage.setItem('favorites', JSON.stringify([...state.favorites]));
}

// Setup event listeners
function setupEventListeners() {
    const addBtn = document.getElementById('addFavoriteBtn');
    const input = document.getElementById('favoriteInput');

    addBtn.addEventListener('click', () => {
        const stockName = input.value.trim().toUpperCase();
        if (stockName) {
            addFavorite(stockName);
            input.value = '';
        }
    });

    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const stockName = input.value.trim().toUpperCase();
            if (stockName) {
                addFavorite(stockName);
                input.value = '';
            }
        }
    });
}

// Connect to SSE stream for all stocks
function connectToAllStocksStream() {
    const connectionName = '__all_stocks__';
    const statusEl = document.getElementById('leftStatus');

    // Prevent multiple reconnection attempts
    if (state.isReconnecting.get(connectionName)) {
        return;
    }

    updateConnectionStatus(statusEl, 'connecting');

    const eventSource = new EventSource(`${API_BASE_URL}/alert`);

    eventSource.onopen = () => {
        console.log('Connected to all stocks stream');
        updateConnectionStatus(statusEl, 'connected');
        state.isReconnecting.set(connectionName, false);
    };

    eventSource.onmessage = (event) => {
        try {
            const stockData = JSON.parse(event.data);
            handleNewStockUpdate(stockData);
        } catch (e) {
            console.error('Error parsing stock data:', e);
        }
    };

    eventSource.onerror = (error) => {
        console.error('SSE connection error:', error);
        updateConnectionStatus(statusEl, 'error');
        eventSource.close();

        // Prevent multiple reconnection timers
        if (state.isReconnecting.get(connectionName)) {
            return;
        }

        state.isReconnecting.set(connectionName, true);

        // Clear any existing reconnect timer
        if (state.reconnectTimers.has(connectionName)) {
            clearTimeout(state.reconnectTimers.get(connectionName));
        }

        // Attempt to reconnect after 1 second
        const timer = setTimeout(() => {
            state.reconnectTimers.delete(connectionName);
            connectToAllStocksStream();
        }, 1000);

        state.reconnectTimers.set(connectionName, timer);
    };
}

// Connect to SSE stream for a specific favorite stock
function connectToFavoriteStream(stockName) {
    if (state.eventSources.has(stockName)) {
        return; // Already connected
    }

    // Prevent multiple reconnection attempts
    if (state.isReconnecting.get(stockName)) {
        return;
    }

    const eventSource = new EventSource(`${API_BASE_URL}/alert/${stockName}`);

    eventSource.onopen = () => {
        console.log(`Connected to ${stockName} stream`);
        state.isReconnecting.set(stockName, false);
    };

    eventSource.onmessage = (event) => {
        try {
            const stockData = JSON.parse(event.data);
            handleFavoriteUpdate(stockData);
        } catch (e) {
            console.error('Error parsing favorite stock data:', e);
        }
    };

    eventSource.onerror = (error) => {
        console.error(`SSE connection error for ${stockName}:`, error);
        eventSource.close();
        state.eventSources.delete(stockName);

        // Only reconnect if still in favorites
        if (!state.favorites.has(stockName)) {
            return;
        }

        // Prevent multiple reconnection timers
        if (state.isReconnecting.get(stockName)) {
            return;
        }

        state.isReconnecting.set(stockName, true);

        // Clear any existing reconnect timer
        if (state.reconnectTimers.has(stockName)) {
            clearTimeout(state.reconnectTimers.get(stockName));
        }

        // Attempt to reconnect after 1 second
        const timer = setTimeout(() => {
            state.reconnectTimers.delete(stockName);
            if (state.favorites.has(stockName)) {
                connectToFavoriteStream(stockName);
            }
        }, 1000);

        state.reconnectTimers.set(stockName, timer);
    };

    state.eventSources.set(stockName, eventSource);
}

// Handle new stock update from all stocks stream
function handleNewStockUpdate(stockData) {
    const stockName = stockData.name.toUpperCase();

    // Add to all stocks map
    if (!state.allStocks.has(stockName)) {
        state.allStocks.set(stockName, []);
    }
    state.allStocks.get(stockName).unshift(stockData);

    // Keep only latest 50 updates per stock
    if (state.allStocks.get(stockName).length > 50) {
        state.allStocks.get(stockName).pop();
    }

    renderAllStocks();
}

// Handle favorite stock update
function handleFavoriteUpdate(stockData) {
    const stockName = stockData.name.toUpperCase();

    if (!state.favorites.has(stockName)) {
        return; // No longer a favorite
    }

    if (!state.favoriteUpdates.has(stockName)) {
        state.favoriteUpdates.set(stockName, []);
    }

    const updates = state.favoriteUpdates.get(stockName);
    updates.unshift(stockData);

    // Keep only latest 2 updates
    if (updates.length > 2) {
        updates.length = 2;
    }

    renderFavorites();
}

// Add a stock to favorites
function addFavorite(stockName) {
    if (state.favorites.has(stockName)) {
        alert(`${stockName} is already in favorites`);
        return;
    }

    state.favorites.add(stockName);
    state.favoriteUpdates.set(stockName, []);
    saveFavoritesToStorage();
    connectToFavoriteStream(stockName);
    renderFavorites();
}

// Remove a stock from favorites
function removeFavorite(stockName) {
    state.favorites.delete(stockName);
    state.favoriteUpdates.delete(stockName);

    // Close the EventSource connection
    if (state.eventSources.has(stockName)) {
        state.eventSources.get(stockName).close();
        state.eventSources.delete(stockName);
    }

    saveFavoritesToStorage();
    renderFavorites();
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
    if (!trend) return '';

    if (trend === 'up') {
        return '<span class="trend-indicator up">↗</span>';
    } else if (trend === 'down') {
        return '<span class="trend-indicator down">↘</span>';
    }

    return '';
}

// Format date and time
function formatDateTime(datetime) {
    const date = new Date(datetime);
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

// Create stock card HTML
function createStockCard(stockData, showTrend = false, previousData = null) {
    const trend = showTrend && previousData ? getBuyTrend(stockData.buy, previousData.buy) : null;
    const trendHTML = renderTrendIndicator(trend);

    return `
        <div class="stock-card">
            <div class="stock-header">
                <div class="stock-name">
                    ${stockData.name}
                    ${trendHTML}
                </div>
                <div class="stock-time">${formatDateTime(stockData.datetime)}</div>
            </div>
            <div class="stock-details">
                <div class="detail-group buy">
                    <div class="detail-label">Buy</div>
                    <div class="detail-value">${stockData.buy.join(', ')}</div>
                </div>
                <div class="detail-group tp">
                    <div class="detail-label">TP</div>
                    <div class="detail-value">${stockData.tp.join(', ')}</div>
                </div>
                <div class="detail-group sl">
                    <div class="detail-label">SL</div>
                    <div class="detail-value">${stockData.sl}</div>
                </div>
            </div>
        </div>
    `;
}

// Render all stocks in left panel
function renderAllStocks() {
    const container = document.getElementById('allStocks');

    if (state.allStocks.size === 0) {
        container.innerHTML = '<div class="empty-state"><p>Waiting for stock updates...</p></div>';
        return;
    }

    // Get all stock updates and sort by datetime
    const allUpdates = [];
    state.allStocks.forEach((updates, stockName) => {
        updates.forEach(update => allUpdates.push(update));
    });

    allUpdates.sort((a, b) => new Date(b.datetime) - new Date(a.datetime));

    // Render latest 20 updates
    const html = allUpdates.slice(0, 20).map(update => createStockCard(update)).join('');
    container.innerHTML = html;
}

// Render favorites in right panel
function renderFavorites() {
    const container = document.getElementById('favoriteStocks');

    if (state.favorites.size === 0) {
        container.innerHTML = '<div class="empty-state"><p>No favorites yet. Add a stock symbol above to track it.</p></div>';
        return;
    }

    const favoritesHTML = [...state.favorites].map(stockName => {
        const updates = state.favoriteUpdates.get(stockName) || [];
        const updateCount = updates.length;

        const updatesHTML = updates.map((update, index) => {
            const previousUpdate = updates[index + 1];
            return createStockCard(update, true, previousUpdate);
        }).join('');

        return `
            <div class="favorite-section">
                <div class="favorite-header">
                    <div class="favorite-title">
                        ${stockName}
                        <span class="update-count">${updateCount} update${updateCount !== 1 ? 's' : ''}</span>
                    </div>
                    <button class="remove-favorite" onclick="removeFavorite('${stockName}')">Remove</button>
                </div>
                <div class="favorite-updates">
                    ${updatesHTML || '<div class="empty-state"><p>Waiting for updates...</p></div>'}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = favoritesHTML;
}

// Make removeFavorite globally accessible
window.removeFavorite = removeFavorite;
