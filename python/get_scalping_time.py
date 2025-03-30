"""
THREE APPROACHES TO ESTIMATE LIMIT ORDER FILL TIME

1. STANDARD APPROACH:
   - Counts orders ahead of yours at the same price level
   - Uses simple trading velocity calculation based on recent trades
   - Estimated time = (orders ahead / velocity) + (your order / velocity)

2. TIME SERIES APPROACH:
   - Analyzes multiple time windows (15min, 1hr, 4hr) to account for trading patterns
   - Applies weighted velocity based on recent market activity
   - More accurate for pairs with fluctuating trading volumes

3. MARKET IMPACT APPROACH:
   - Considers how large orders can slow down as they're filled
   - Adjusts for market liquidity, volatility, and spread
   - Better for large orders in less liquid markets

The results from all three approaches provide a range of estimates for comparison.
"""

import requests
import pandas as pd
import numpy as np
from datetime import datetime
import time

# Binance API endpoints
BASE_URL = 'https://api.binance.com'
ORDER_BOOK_ENDPOINT = '/api/v3/depth'
TRADES_ENDPOINT = '/api/v3/trades'
TICKER_24HR_ENDPOINT = '/api/v3/ticker/24hr'

def get_order_book(symbol, limit=500):
    params = {'symbol': symbol, 'limit': limit}
    response = requests.get(f"{BASE_URL}{ORDER_BOOK_ENDPOINT}", params=params)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Error fetching order book: {response.text}")

def get_recent_trades(symbol, limit=1000):
    params = {'symbol': symbol, 'limit': limit}
    response = requests.get(f"{BASE_URL}{TRADES_ENDPOINT}", params=params)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Error fetching recent trades: {response.text}")

def get_24h_ticker(symbol):
    params = {'symbol': symbol}
    response = requests.get(f"{BASE_URL}{TICKER_24HR_ENDPOINT}", params=params)
    if response.status_code == 200:
        return response.json()
    else:
        raise Exception(f"Error fetching 24h ticker: {response.text}")

def estimate_standard(symbol, side, price, quantity, market_data):
    """Approach 1: Standard estimation method"""
    order_book, recent_trades, ticker_24h = market_data
    
    # Process order book
    bids_df = pd.DataFrame(order_book['bids'], columns=['price', 'quantity'])
    asks_df = pd.DataFrame(order_book['asks'], columns=['price', 'quantity'])
    bids_df['price'] = bids_df['price'].astype(float)
    bids_df['quantity'] = bids_df['quantity'].astype(float)
    asks_df['price'] = asks_df['price'].astype(float)
    asks_df['quantity'] = asks_df['quantity'].astype(float)
    
    # Get best bid and ask
    best_bid = float(bids_df.iloc[0]['price']) if not bids_df.empty else 0
    best_ask = float(asks_df.iloc[0]['price']) if not asks_df.empty else 0
    
    # Process trades
    trades_df = pd.DataFrame(recent_trades)
    if not trades_df.empty:
        trades_df['price'] = trades_df['price'].astype(float)
        trades_df['qty'] = trades_df['qty'].astype(float)
        trades_df['time'] = pd.to_datetime(trades_df['time'], unit='ms')
        trades_df = trades_df.sort_values('time')
    
    # Find position in order book
    if side.upper() == 'BUY':
        same_price_orders = bids_df[bids_df['price'] == price]['quantity'].sum()
        better_price_orders = bids_df[bids_df['price'] > price]['quantity'].sum()
        orders_ahead = same_price_orders * 0.5 + better_price_orders
        matching_trades = trades_df[trades_df['price'] <= price] if not trades_df.empty else pd.DataFrame()
    else:  # SELL
        same_price_orders = asks_df[asks_df['price'] == price]['quantity'].sum()
        better_price_orders = asks_df[asks_df['price'] < price]['quantity'].sum()
        orders_ahead = same_price_orders * 0.5 + better_price_orders
        matching_trades = trades_df[trades_df['price'] >= price] if not trades_df.empty else pd.DataFrame()
    
    # Calculate trading velocity
    if len(matching_trades) > 0:
        matching_volume = matching_trades['qty'].sum()
        time_span = (matching_trades['time'].max() - matching_trades['time'].min()).total_seconds()
        
        if time_span > 0:
            volume_per_second = matching_volume / time_span
        else:
            volume_per_second = float(ticker_24h['volume']) / 86400 * 0.2
    else:
        volume_per_second = float(ticker_24h['volume']) / 86400 * 0.05
    
    # Calculate estimated time
    if volume_per_second > 0:
        time_for_orders_ahead = orders_ahead / volume_per_second if orders_ahead > 0 else 0
        time_for_our_order = quantity / volume_per_second
        estimated_seconds = time_for_orders_ahead + time_for_our_order
    else:
        estimated_seconds = float('inf')
    
    # Format result
    if estimated_seconds == float('inf'):
        human_readable = "Cannot estimate"
    elif estimated_seconds < 60:
        human_readable = f"{estimated_seconds:.2f} sec"
    elif estimated_seconds < 3600:
        human_readable = f"{estimated_seconds/60:.2f} min"
    elif estimated_seconds < 86400:
        human_readable = f"{estimated_seconds/3600:.2f} hrs"
    else:
        human_readable = f"{estimated_seconds/86400:.2f} days"
    
    return {
        'time': human_readable,
        'seconds': estimated_seconds,
        'velocity': volume_per_second,
        'orders_ahead': orders_ahead
    }

def estimate_time_series(symbol, side, price, quantity, market_data):
    """Approach 2: Time series based estimation"""
    order_book, recent_trades, ticker_24h = market_data
    
    # Process order book
    bids_df = pd.DataFrame(order_book['bids'], columns=['price', 'quantity'])
    asks_df = pd.DataFrame(order_book['asks'], columns=['price', 'quantity'])
    bids_df['price'] = bids_df['price'].astype(float)
    bids_df['quantity'] = bids_df['quantity'].astype(float)
    asks_df['price'] = asks_df['price'].astype(float)
    asks_df['quantity'] = asks_df['quantity'].astype(float)
    
    # Process trades
    trades_df = pd.DataFrame(recent_trades)
    if trades_df.empty:
        return {'time': "Cannot estimate", 'seconds': float('inf'), 'velocity': 0, 'orders_ahead': 0}
        
    trades_df['price'] = trades_df['price'].astype(float)
    trades_df['qty'] = trades_df['qty'].astype(float)
    trades_df['time'] = pd.to_datetime(trades_df['time'], unit='ms')
    trades_df = trades_df.sort_values('time')
    
    # Create time windows
    now = trades_df['time'].max()
    time_windows = [
        ('last_15min', now - pd.Timedelta(minutes=15), 0.5),
        ('last_hour', now - pd.Timedelta(hours=1), 0.3),
        ('last_4hours', now - pd.Timedelta(hours=4), 0.2)
    ]
    
    # Calculate weighted velocities
    weighted_velocity = 0
    weights_sum = 0
    
    for window_name, start_time, weight in time_windows:
        window_trades = trades_df[trades_df['time'] >= start_time]
        
        if len(window_trades) > 1:
            if side.upper() == 'BUY':
                matching_window_trades = window_trades[window_trades['price'] <= price]
            else:
                matching_window_trades = window_trades[window_trades['price'] >= price]
            
            if len(matching_window_trades) > 1:
                window_volume = matching_window_trades['qty'].sum()
                window_time_span = (matching_window_trades['time'].max() - matching_window_trades['time'].min()).total_seconds()
                
                if window_time_span > 0:
                    window_velocity = window_volume / window_time_span
                    weighted_velocity += window_velocity * weight
                    weights_sum += weight
    
    # Fallback if needed
    if weights_sum == 0 or weighted_velocity == 0:
        weighted_velocity = float(ticker_24h['volume']) / 86400 * 0.05
    else:
        weighted_velocity = weighted_velocity / weights_sum
    
    # Calculate orders ahead
    if side.upper() == 'BUY':
        same_price_orders = bids_df[bids_df['price'] == price]['quantity'].sum()
        better_price_orders = bids_df[bids_df['price'] > price]['quantity'].sum()
        nearby_orders = bids_df[(bids_df['price'] >= price * 0.9999) & (bids_df['price'] <= price * 1.0001)]['quantity'].sum()
        orders_ahead = same_price_orders * 0.5 + better_price_orders + nearby_orders * 0.2
    else:
        same_price_orders = asks_df[asks_df['price'] == price]['quantity'].sum()
        better_price_orders = asks_df[asks_df['price'] < price]['quantity'].sum()
        nearby_orders = asks_df[(asks_df['price'] >= price * 0.9999) & (asks_df['price'] <= price * 1.0001)]['quantity'].sum()
        orders_ahead = same_price_orders * 0.5 + better_price_orders + nearby_orders * 0.2
    
    # Calculate estimated time
    if weighted_velocity > 0:
        estimated_seconds = orders_ahead / weighted_velocity + quantity / weighted_velocity
    else:
        estimated_seconds = float('inf')
    
    # Format result
    if estimated_seconds == float('inf'):
        human_readable = "Cannot estimate"
    elif estimated_seconds < 60:
        human_readable = f"{estimated_seconds:.2f} sec"
    elif estimated_seconds < 3600:
        human_readable = f"{estimated_seconds/60:.2f} min"
    elif estimated_seconds < 86400:
        human_readable = f"{estimated_seconds/3600:.2f} hrs"
    else:
        human_readable = f"{estimated_seconds/86400:.2f} days"
    
    return {
        'time': human_readable,
        'seconds': estimated_seconds,
        'velocity': weighted_velocity,
        'orders_ahead': orders_ahead
    }

def estimate_market_impact(symbol, side, price, quantity, market_data):
    """Approach 3: Market impact based estimation"""
    order_book, recent_trades, ticker_24h = market_data
    
    # Process order book
    bids_df = pd.DataFrame(order_book['bids'], columns=['price', 'quantity'])
    asks_df = pd.DataFrame(order_book['asks'], columns=['price', 'quantity'])
    bids_df['price'] = bids_df['price'].astype(float)
    bids_df['quantity'] = bids_df['quantity'].astype(float)
    asks_df['price'] = asks_df['price'].astype(float)
    asks_df['quantity'] = asks_df['quantity'].astype(float)
    
    # Get best bid and ask
    best_bid = float(bids_df.iloc[0]['price']) if not bids_df.empty else 0
    best_ask = float(asks_df.iloc[0]['price']) if not asks_df.empty else 0
    
    # Calculate spread as liquidity indicator
    spread = best_ask - best_bid
    spread_percentage = spread / best_bid if best_bid > 0 else 0
    
    # Process trades
    trades_df = pd.DataFrame(recent_trades)
    if trades_df.empty:
        return {'time': "Cannot estimate", 'seconds': float('inf'), 'velocity': 0, 'orders_ahead': 0}
        
    trades_df['price'] = trades_df['price'].astype(float)
    trades_df['qty'] = trades_df['qty'].astype(float)
    trades_df['time'] = pd.to_datetime(trades_df['time'], unit='ms')
    trades_df = trades_df.sort_values('time')
    
    # Calculate volatility
    price_volatility = trades_df['price'].std() / trades_df['price'].mean() if len(trades_df) > 1 else 0.001
    
    # Apply recency weighting (more recent trades have higher importance)
    trades_df['weight'] = np.linspace(0.5, 1.0, len(trades_df))
    
    # Filter matching trades
    if side.upper() == 'BUY':
        matching_trades = trades_df[trades_df['price'] <= price]
    else:
        matching_trades = trades_df[trades_df['price'] >= price]
    
    # Calculate weighted velocity
    if len(matching_trades) > 1:
        weighted_volume = (matching_trades['qty'] * matching_trades['weight']).sum()
        time_span = (matching_trades['time'].max() - matching_trades['time'].min()).total_seconds()
        
        if time_span > 0:
            base_velocity = weighted_volume / time_span
        else:
            base_velocity = float(ticker_24h['volume']) / 86400 * 0.05
    else:
        base_velocity = float(ticker_24h['volume']) / 86400 * 0.05
    
    # Calculate market depth and impact
    if side.upper() == 'BUY':
        same_price_orders = bids_df[bids_df['price'] == price]['quantity'].sum()
        better_price_orders = bids_df[bids_df['price'] > price]['quantity'].sum()
        orders_ahead = same_price_orders * 0.5 + better_price_orders
        
        # Calculate nearby volume to assess market depth
        price_buffer = price * 0.0001
        nearby_volume = bids_df[(bids_df['price'] >= price - price_buffer) & 
                                (bids_df['price'] <= price + price_buffer)]['quantity'].sum()
    else:
        same_price_orders = asks_df[asks_df['price'] == price]['quantity'].sum()
        better_price_orders = asks_df[asks_df['price'] < price]['quantity'].sum()
        orders_ahead = same_price_orders * 0.5 + better_price_orders
        
        price_buffer = price * 0.0001
        nearby_volume = asks_df[(asks_df['price'] >= price - price_buffer) & 
                               (asks_df['price'] <= price + price_buffer)]['quantity'].sum()
    
    # Adjust velocity based on market factors
    spread_factor = max(0.5, 1.0 - (spread_percentage * 100))
    volatility_factor = min(1.5, 1.0 + (price_volatility * 10))
    size_ratio = quantity / (nearby_volume + 1)
    size_factor = max(0.3, 1.0 - (size_ratio * 0.5))
    
    adjusted_velocity = base_velocity * spread_factor * volatility_factor * size_factor
    
    # Model slower fill rates for large orders
    if quantity > nearby_volume * 2:
        first_chunk = nearby_volume
        remaining = quantity - first_chunk
        
        time_for_first_chunk = first_chunk / adjusted_velocity
        time_for_remaining = remaining / (adjusted_velocity * 0.6)  # 40% slower for remaining
        
        estimated_seconds = orders_ahead / adjusted_velocity + time_for_first_chunk + time_for_remaining
    else:
        estimated_seconds = orders_ahead / adjusted_velocity + quantity / adjusted_velocity
    
    # Format result
    if estimated_seconds == float('inf'):
        human_readable = "Cannot estimate"
    elif estimated_seconds < 60:
        human_readable = f"{estimated_seconds:.2f} sec"
    elif estimated_seconds < 3600:
        human_readable = f"{estimated_seconds/60:.2f} min"
    elif estimated_seconds < 86400:
        human_readable = f"{estimated_seconds/3600:.2f} hrs"
    else:
        human_readable = f"{estimated_seconds/86400:.2f} days"
    
    return {
        'time': human_readable,
        'seconds': estimated_seconds,
        'velocity': adjusted_velocity,
        'orders_ahead': orders_ahead
    }

# Configuration
quantity = 100000  # Amount to estimate
trading_pairs = [
    'USDCUSDT',
    'FDUSDUSDC',
    'FDUSDUSDT',
    'XUSDUSDT',
    'TUSDUSDT',
    'USDPUSDT'
]

# Print header
print(f"\nESTIMATED FILL TIMES COMPARISON FOR {quantity} UNITS\n")
print(f"{'Trading Pair':<12} {'Side':<6} {'Price':<10} {'Standard':<15} {'Time Series':<15} {'Market Impact':<15} {'Bid/Ask':<20}")
print("-" * 95)

# Get estimates for each pair
for pair in trading_pairs:
    try:
        # Get market data once per pair to ensure consistent comparison
        market_data = (
            get_order_book(pair),
            get_recent_trades(pair),
            get_24h_ticker(pair)
        )
        
        # Process order book to get prices
        order_book = market_data[0]
        bids_df = pd.DataFrame(order_book['bids'], columns=['price', 'quantity'])
        asks_df = pd.DataFrame(order_book['asks'], columns=['price', 'quantity'])
        
        if bids_df.empty or asks_df.empty:
            print(f"{pair:<12} {'N/A':<6} {'N/A':<10} {'No orders':<15} {'No orders':<15} {'No orders':<15}")
            continue
            
        bids_df['price'] = bids_df['price'].astype(float)
        asks_df['price'] = asks_df['price'].astype(float)
        
        best_bid = float(bids_df.iloc[0]['price'])
        best_ask = float(asks_df.iloc[0]['price'])
        
        # Use non-marketable orders for realistic estimates
        buy_price = best_bid
        sell_price = best_ask
        
        # Get all estimates
        buy_standard = estimate_standard(pair, 'BUY', buy_price, quantity, market_data)
        buy_timeseries = estimate_time_series(pair, 'BUY', buy_price, quantity, market_data)
        buy_impact = estimate_market_impact(pair, 'BUY', buy_price, quantity, market_data)
        
        sell_standard = estimate_standard(pair, 'SELL', sell_price, quantity, market_data)
        sell_timeseries = estimate_time_series(pair, 'SELL', sell_price, quantity, market_data)
        sell_impact = estimate_market_impact(pair, 'SELL', sell_price, quantity, market_data)
        
        # Print results
        bid_ask = f"{best_bid:.6f}/{best_ask:.6f}"
        print(f"{pair:<12} {'BUY':<6} {buy_price:<10.6f} {buy_standard['time']:<15} {buy_timeseries['time']:<15} {buy_impact['time']:<15} {bid_ask:<20}")
        print(f"{pair:<12} {'SELL':<6} {sell_price:<10.6f} {sell_standard['time']:<15} {sell_timeseries['time']:<15} {sell_impact['time']:<15} {bid_ask:<20}")
        
        # Avoid rate limiting
        time.sleep(0.5)
        
    except Exception as e:
        print(f"{pair:<12} {'N/A':<6} {'N/A':<10} {'Error: ' + str(e)[:20] + '...':<15}")