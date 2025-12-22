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

    // Pagination state
    pagination: {
        skip: 0,
        limit: 20,
        isLoading: false,
        hasMore: true,
        searchTerm: ''
    }
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOMContentLoaded fired');
    loadFavoritesFromStorage();
    setupEventListeners();

    // Load historical data first
    console.log('About to load historical data');
    await loadHistoricalData();
    console.log('Historical data loaded');

    // Then connect to real-time updates
    console.log('About to connect to stream');
    connectToAllStocksStream();

    // Load favorites data and render
    console.log('About to load favorites data');
    await loadFavoritesData();
    console.log('Favorites data loaded');
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
    const leftSearchInput = document.getElementById('leftSearchInput');
    const rightSearchInput = document.getElementById('rightSearchInput');
    const allStocksContainer = document.getElementById('allStocks');

    if (!leftSearchInput) {
        console.error('Left search input element not found!');
        return;
    }

    if (!rightSearchInput) {
        console.error('Right search input element not found!');
        return;
    }

    // Debounce function for search
    let searchTimeout;
    leftSearchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const searchTerm = e.target.value.trim();

        searchTimeout = setTimeout(async () => {
            // Reset pagination and reload with search
            state.pagination.skip = 0;
            state.pagination.hasMore = true;
            state.pagination.searchTerm = searchTerm;
            state.allStocks.clear();
            await loadHistoricalData();
        }, 300); // 300ms debounce
    });

    rightSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim().toUpperCase();
        filterFavoriteStocks(searchTerm);
    });

    // Infinite scroll for left panel
    allStocksContainer.addEventListener('scroll', async () => {
        const { scrollTop, scrollHeight, clientHeight } = allStocksContainer;

        // Check if scrolled near bottom (within 100px)
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            if (!state.pagination.isLoading && state.pagination.hasMore) {
                await loadMoreStocks();
            }
        }
    });

    console.log('Event listeners set up successfully');
}

// Filter favorite stocks in right panel
function filterFavoriteStocks(searchTerm) {
    const favoriteSections = document.querySelectorAll('#favoriteStocks .favorite-section');

    favoriteSections.forEach(section => {
        const stockName = section.querySelector('.favorite-title').textContent.trim();
        if (!searchTerm || stockName.includes(searchTerm)) {
            section.style.display = '';
        } else {
            section.style.display = 'none';
        }
    });
}

// Connect to SSE stream for all stocks
function connectToAllStocksStream() {
    const connectionName = '__all_stocks__';
    const statusEl = document.getElementById('leftStatus');

    console.log('Attempting to connect to SSE stream:', `${API_BASE_URL}/alert`);

    // Prevent multiple reconnection attempts
    if (state.isReconnecting.get(connectionName)) {
        console.log('Already reconnecting, skipping...');
        return;
    }

    // Don't update status if we're first connecting (status already set by loadHistoricalData)
    // Only update on reconnects

    const eventSource = new EventSource(`${API_BASE_URL}/alert`);
    console.log('EventSource created');

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

// Load historical data on page load
async function loadHistoricalData() {
    const statusEl = document.getElementById('leftStatus');
    updateConnectionStatus(statusEl, 'connecting');

    state.pagination.isLoading = true;

    try {
        const searchParam = state.pagination.searchTerm ? `&stock_name=${encodeURIComponent(state.pagination.searchTerm)}` : '';
        const url = `${API_BASE_URL}/history?skip=${state.pagination.skip}&limit=${state.pagination.limit}${searchParam}`;
        console.log('Fetching historical data from:', url);
        const response = await fetch(url);
        console.log('History response status:', response.status);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('History data received, count:', data.trading_plans?.length || 0);

        // Check if there's more data to load
        state.pagination.hasMore = data.count === state.pagination.limit;

        // Process historical data
        data.trading_plans.forEach(plan => {
            const stockName = plan.name.toUpperCase();

            if (!state.allStocks.has(stockName)) {
                state.allStocks.set(stockName, []);
            }

            // Add to all stocks (use message_id to check duplicates)
            const existing = state.allStocks.get(stockName).find(
                item => item.message_id === plan.message_id
            );
            if (!existing) {
                state.allStocks.get(stockName).push(plan);
            }
        });

        // Update skip for next page
        state.pagination.skip += data.count;

        // Render data
        renderAllStocks();

        // Update status to show we're ready for real-time
        const statusText = statusEl.querySelector('.status-text');
        statusText.textContent = 'Connecting to live stream...';
    } catch (error) {
        console.error('Error loading historical data:', error);
        updateConnectionStatus(statusEl, 'error');
    } finally {
        state.pagination.isLoading = false;
    }
}

// Load more stocks (pagination)
async function loadMoreStocks() {
    if (state.pagination.isLoading || !state.pagination.hasMore) {
        return;
    }

    state.pagination.isLoading = true;

    try {
        const searchParam = state.pagination.searchTerm ? `&stock_name=${encodeURIComponent(state.pagination.searchTerm)}` : '';
        const url = `${API_BASE_URL}/history?skip=${state.pagination.skip}&limit=${state.pagination.limit}${searchParam}`;
        console.log('Loading more stocks from:', url);

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        console.log('More stocks loaded, count:', data.count);

        // Check if there's more data to load
        state.pagination.hasMore = data.count === state.pagination.limit;

        // Process new data
        data.trading_plans.forEach(plan => {
            const stockName = plan.name.toUpperCase();

            if (!state.allStocks.has(stockName)) {
                state.allStocks.set(stockName, []);
            }

            // Add to all stocks (use message_id to check duplicates)
            const existing = state.allStocks.get(stockName).find(
                item => item.message_id === plan.message_id
            );
            if (!existing) {
                state.allStocks.get(stockName).push(plan);
            }
        });

        // Update skip for next page
        state.pagination.skip += data.count;

        // Re-render to show new data
        renderAllStocks();
    } catch (error) {
        console.error('Error loading more stocks:', error);
    } finally {
        state.pagination.isLoading = false;
    }
}

// Load historical data for favorites
async function loadFavoritesData() {
    const promises = [...state.favorites].map(async (stockName) => {
        try {
            const response = await fetch(`${API_BASE_URL}/history?stock_name=${stockName}&limit=2`);
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();

            if (data.trading_plans.length > 0) {
                state.favoriteUpdates.set(stockName, data.trading_plans);
            }

            // Connect to SSE stream for this favorite
            connectToFavoriteStream(stockName);
        } catch (error) {
            console.error(`Error loading data for ${stockName}:`, error);
        }
    });

    await Promise.all(promises);
}

// Handle new stock update from all stocks stream
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

    // Fetch the previous update from the backend for accurate trend calculation
    try {
        const response = await fetch(`${API_BASE_URL}/history?stock_name=${encodeURIComponent(stockData.name)}&limit=1`);
        if (response.ok) {
            const data = await response.json();
            if (data.trading_plans.length > 0 && data.trading_plans[0].previous) {
                // Add the previous data to the new stock data
                stockData.previous = data.trading_plans[0].previous;
            }
        }
    } catch (error) {
        console.error(`Error fetching previous data for ${stockName}:`, error);
    }

    state.allStocks.get(stockName).unshift(stockData);

    // Keep only latest 50 updates per stock
    if (state.allStocks.get(stockName).length > 50) {
        state.allStocks.get(stockName).pop();
    }

    // Also update favorites if this stock is favorited
    if (state.favorites.has(stockName)) {
        if (!state.favoriteUpdates.has(stockName)) {
            state.favoriteUpdates.set(stockName, []);
        }

        const favoriteList = state.favoriteUpdates.get(stockName);

        // Check for duplicates in favorites
        const existingInFavorites = favoriteList.find(
            item => item.message_id === stockData.message_id
        );

        if (!existingInFavorites) {
            favoriteList.unshift(stockData);

            // Keep only latest 2 updates
            if (favoriteList.length > 2) {
                favoriteList.length = 2;
            }

            renderFavorites();
        }
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

    // Check for duplicates using message_id
    const existing = updates.find(item => item.message_id === stockData.message_id);
    if (existing) {
        console.log(`Duplicate favorite message_id ${stockData.message_id} for ${stockName} - skipping`);
        return;
    }

    updates.unshift(stockData);

    // Keep only latest 2 updates
    if (updates.length > 2) {
        updates.length = 2;
    }

    renderFavorites();
}

// Add a stock to favorites
async function addFavorite(stockName) {
    if (state.favorites.has(stockName)) {
        alert(`${stockName} is already in favorites`);
        return;
    }

    state.favorites.add(stockName);
    state.favoriteUpdates.set(stockName, []);
    saveFavoritesToStorage();

    // Load historical data for this stock
    try {
        const response = await fetch(`${API_BASE_URL}/history?stock_name=${stockName}&limit=2`);
        if (response.ok) {
            const data = await response.json();
            if (data.trading_plans.length > 0) {
                state.favoriteUpdates.set(stockName, data.trading_plans);
            }
        }
    } catch (error) {
        console.error(`Error loading history for ${stockName}:`, error);
    }

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

// Create stock card HTML with trend indicators
function createStockCardWithTrend(stockData, previousData = null, showFavoriteStar = false) {
    const isFavorite = state.favorites.has(stockData.name.toUpperCase());
    const starIcon = isFavorite ? '★' : '☆';
    const starClass = isFavorite ? 'favorite-star active' : 'favorite-star';

    // Calculate overall trend based on buy values
    const trend = previousData ? getBuyTrend(stockData.buy, previousData.buy) : null;
    const trendHTML = renderTrendIndicator(trend);

    return `
        <div class="stock-card" data-stock-name="${stockData.name.toUpperCase()}">
            <div class="stock-header">
                <div class="stock-name">
                    ${showFavoriteStar ? `<span class="${starClass}" onclick="toggleFavorite('${stockData.name.toUpperCase()}')" title="${isFavorite ? 'Remove from favorites' : 'Add to favorites'}">${starIcon}</span>` : ''}
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

// Toggle favorite status
function toggleFavorite(stockName) {
    if (state.favorites.has(stockName)) {
        removeFavorite(stockName);
    } else {
        addFavorite(stockName);
    }
    // Re-render to update star icons
    renderAllStocks();
}

// Render all stocks in left panel
function renderAllStocks() {
    const container = document.getElementById('allStocks');

    if (state.allStocks.size === 0 && !state.pagination.isLoading) {
        container.innerHTML = '<div class="empty-state"><p>Waiting for stock updates...</p></div>';
        return;
    }

    // Get all stock updates and sort by datetime
    const allUpdates = [];
    state.allStocks.forEach((updates, stockName) => {
        updates.forEach((update) => {
            // Use the 'previous' data from backend if available
            const previousUpdate = update.previous || null;
            allUpdates.push({ update, previousUpdate });
        });
    });

    allUpdates.sort((a, b) => new Date(b.update.datetime) - new Date(a.update.datetime));

    // Render all loaded updates with favorite star and trend indicators
    let html = allUpdates.map(({ update, previousUpdate }) =>
        createStockCardWithTrend(update, previousUpdate, true)
    ).join('');

    // Add loading indicator at the bottom if loading more
    if (state.pagination.isLoading) {
        html += '<div class="loading-indicator" style="text-align: center; padding: 20px; color: #858585;">Loading more...</div>';
    } else if (!state.pagination.hasMore && allUpdates.length > 0) {
        html += '<div class="loading-indicator" style="text-align: center; padding: 20px; color: #6a6a6a;">No more updates</div>';
    }

    container.innerHTML = html;
}

// Create combined favorite card with both current and previous values
function createFavoriteCard(currentData, previousData, stockName) {
    const trend = previousData ? getBuyTrend(currentData.buy, previousData.buy) : null;
    const trendHTML = renderTrendIndicator(trend);

    // Helper function to create value display with change indicator (strikethrough only)
    const createValueWithChange = (currentVal, prevVal, isArray = true) => {
        if (!prevVal) {
            return isArray ? currentVal.join(', ') : currentVal;
        }

        const current = isArray ? currentVal[0] : currentVal;
        const prev = isArray ? prevVal[0] : prevVal;

        if (current === prev) {
            return isArray ? currentVal.join(', ') : currentVal;
        }

        return `
            <div class="value-change-vertical">
                <div class="current-value">${isArray ? currentVal.join(', ') : currentVal}</div>
                <div class="previous-value">${isArray ? prevVal.join(', ') : prevVal}</div>
            </div>
        `;
    };

    return `
        <div class="stock-card favorite-card">
            <div class="stock-header">
                <div class="stock-name">
                    ${stockName}
                    ${trendHTML}
                </div>
                <div class="stock-time">${formatDateTime(currentData.datetime)}</div>
            </div>
            <div class="stock-details">
                <div class="detail-group buy">
                    <div class="detail-label">Buy</div>
                    <div class="detail-value">${createValueWithChange(currentData.buy, previousData?.buy)}</div>
                </div>
                <div class="detail-group tp">
                    <div class="detail-label">TP</div>
                    <div class="detail-value">${createValueWithChange(currentData.tp, previousData?.tp)}</div>
                </div>
                <div class="detail-group sl">
                    <div class="detail-label">SL</div>
                    <div class="detail-value">${createValueWithChange([currentData.sl], previousData ? [previousData.sl] : null, false)}</div>
                </div>
            </div>
        </div>
    `;
}

// Render favorites in right panel
function renderFavorites() {
    const container = document.getElementById('favoriteStocks');

    if (state.favorites.size === 0) {
        container.innerHTML = '<div class="empty-state"><p>No favorites yet. Click the star on any stock in the left panel to add it to favorites.</p></div>';
        return;
    }

    const favoritesHTML = [...state.favorites].map(stockName => {
        const updates = state.favoriteUpdates.get(stockName) || [];

        if (updates.length === 0) {
            return `
                <div class="favorite-section">
                    <div class="favorite-header">
                        <div class="favorite-title">
                            ${stockName}
                        </div>
                        <button class="remove-favorite" onclick="removeFavorite('${stockName}')">Remove</button>
                    </div>
                    <div class="favorite-updates">
                        <div class="empty-state"><p>Waiting for updates...</p></div>
                    </div>
                </div>
            `;
        }

        const currentUpdate = updates[0];
        const previousUpdate = updates.length > 1 ? updates[1] : null;
        const cardHTML = createFavoriteCard(currentUpdate, previousUpdate, stockName);

        return `
            <div class="favorite-section">
                <div class="favorite-header">
                    <div class="favorite-title">${stockName}</div>
                    <button class="remove-favorite" onclick="removeFavorite('${stockName}')">Remove</button>
                </div>
                <div class="favorite-updates">
                    ${cardHTML}
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = favoritesHTML;
}

// Make functions globally accessible
window.removeFavorite = removeFavorite;
window.toggleFavorite = toggleFavorite;
