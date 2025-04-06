# StablecoinScalper.py - Improved Version
from freqtrade.strategy import IStrategy
from pandas import DataFrame
import numpy as np
import logging
from datetime import datetime, timedelta
from freqtrade.persistence import Trade
import pandas_ta as ta

logger = logging.getLogger(__name__)

class StablecoinScalper(IStrategy):
    """
    Adaptive Stablecoin Scalping Strategy
    
    Analyzes recent price movements to find optimal entry and exit points.
    Uses bid-ask zone detection for stablecoin pairs.
    """
    
    # Minimal ROI - lower to match our expected small profits (0.01%)
    minimal_roi = {
        "0": 0.0001  # 0.01% profit target
    }
    
    # Settings
    timeframe = '1m'
    stoploss = -0.0005  # Tighter stop loss (0.05%)
    trailing_stop = False
    process_only_new_candles = True
    startup_candle_count = 200  # Need more data for volatility calculations
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False
    
    # Define parameters
    buy_threshold = 0.9998  # Relative value, adapts to recent price action
    sell_threshold = 1.0002  # Relative value, adapts to recent price action
    
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Adds indicators to identify optimal trading zones
        """
        # Calculate rolling statistics to identify price zones
        dataframe['price_mean'] = dataframe['close'].rolling(window=500).mean()
        
        # Calculate standard deviation to identify volatility
        dataframe['price_std'] = dataframe['close'].rolling(window=500).std()
        
        # Calculate reasonable price deviation for this pair
        dataframe['lower_band'] = dataframe['price_mean'] - (dataframe['price_std'] * 1.5)
        dataframe['upper_band'] = dataframe['price_mean'] + (dataframe['price_std'] * 1.5)
        
        # Historical price levels (lows and highs)
        dataframe['recent_min'] = dataframe['low'].rolling(window=100).min()
        dataframe['recent_max'] = dataframe['high'].rolling(window=100).max()
        
        # Weighted average price
        dataframe['vwap'] = (dataframe['close'] * dataframe['volume']).rolling(20).sum() / dataframe['volume'].rolling(20).sum()
        
        # Calculate historical volatility
        dataframe['volatility'] = dataframe['price_std'] / dataframe['price_mean']
        
        # Check if there's enough price movement for this strategy to work
        range_pct = (dataframe['recent_max'] - dataframe['recent_min']) / dataframe['price_mean']
        dataframe['enough_range'] = range_pct > 0.0002  # Need at least 0.02% range
        
        # Calculate dynamic buy/sell levels based on recent price action
        dataframe['buy_level'] = dataframe['recent_min'] + (0.1 * (dataframe['recent_max'] - dataframe['recent_min']))
        dataframe['sell_level'] = dataframe['recent_min'] + (0.9 * (dataframe['recent_max'] - dataframe['recent_min']))
        
        return dataframe
    
    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Buy when price dips to lower range of recent price action
        """
        pair = metadata['pair']
        
        # Only apply to stablecoin pairs
        if 'USDT' in pair and ('USDC' in pair or 'BUSD' in pair or 'TUSD' in pair or 'FDUSD' in pair):
            conditions = [
                # Price is near the lower range of recent activity
                dataframe['close'] <= dataframe['buy_level'],
                # Make sure there's enough historical range for this to work
                dataframe['enough_range'],
                # Ensure volatility is reasonable (not too low or high)
                dataframe['volatility'] > 0.00005,
                dataframe['volatility'] < 0.001,
                # Volume should be reasonable
                dataframe['volume'] > 0
            ]
            dataframe['buy'] = np.where(np.logical_and.reduce(conditions), 1, 0)
        else:
            dataframe['buy'] = 0
            
        return dataframe
    
    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Sell when price reaches upper range of recent price action
        """
        pair = metadata['pair']
        
        # Only apply to stablecoin pairs
        if 'USDT' in pair and ('USDC' in pair or 'BUSD' in pair or 'TUSD' in pair or 'FDUSD' in pair):
            conditions = [
                # Price is near the upper range of recent activity
                dataframe['close'] >= dataframe['sell_level'],
                # Volume should be reasonable
                dataframe['volume'] > 0
            ]
            dataframe['sell'] = np.where(np.logical_and.reduce(conditions), 1, 0)
        else:
            dataframe['sell'] = 0
            
        return dataframe
    
    def confirm_trade_entry(self, pair: str, order_type: str, amount: float, rate: float, 
                           time_in_force: str, current_time: datetime, **kwargs) -> bool:
        """
        Additional checks before entering a trade
        """
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        if dataframe.empty:
            return False
            
        current_candle = dataframe.iloc[-1].squeeze()
        
        # Make sure there's decent volume (at least $10,000 in last candle)
        if current_candle['volume'] * current_candle['close'] < 10000:
            return False
        
        # Check if buy price offers potential profit margin
        # Need at least 0.015% between buy price and recent high
        if (current_candle['recent_max'] / rate - 1) < 0.00015:
            return False
            
        return True
    
    def custom_exit(self, pair: str, trade: Trade, current_time: datetime, current_rate: float,
                   current_profit: float, **kwargs):
        """
        Custom exit conditions
        """
        # Get the dataframe for this pair
        dataframe, _ = self.dp.get_analyzed_dataframe(pair, self.timeframe)
        if dataframe.empty:
            return None
        
        # Shorter timeout - exit after 30 minutes
        if current_time - trade.open_date_utc > timedelta(minutes=30):
            return 'timeout_exit'
            
        # If we're in very slight profit and price is declining, take it
        if 0 < current_profit < 0.0005:
            current_candle = dataframe.iloc[-1].squeeze()
            prev_candle = dataframe.iloc[-2].squeeze()
            
            if current_candle['close'] < prev_candle['close']:
                return 'small_profit_exit'
        
        return None