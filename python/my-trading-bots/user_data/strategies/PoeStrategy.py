# SimpleStablecoinScalper.py
from freqtrade.strategy import IStrategy
from pandas import DataFrame
import numpy as np
import logging
from datetime import datetime, timedelta
from freqtrade.persistence import Trade

logger = logging.getLogger(__name__)

class PoeStrategy(IStrategy):
    """
    Ultra-simple stablecoin scalping strategy.
    Buys when price drops even slightly below peg and sells on tiny profit.
    """
    
    # Minimal ROI - very tiny profit target
    minimal_roi = {
        "0": 0.0003  # Just 0.03% profit target
    }
    
    # Settings
    timeframe = '1m'
    stoploss = -0.001  # 0.1% stop loss
    trailing_stop = False
    process_only_new_candles = True
    startup_candle_count = 30
    use_exit_signal = True
    exit_profit_only = False
    ignore_roi_if_entry_signal = False
    
    # Price thresholds - very small to ensure we get trades
    buy_below = 0.9999  # Buy when below 0.9997 (just 0.03% below peg)
    sell_above = 1.0000  # Sell when back at peg
    
    def populate_indicators(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Add basic indicators
        """
        # 10-period simple moving average
        dataframe['sma10'] = dataframe['close'].rolling(window=10).mean()
        
        # Volume moving average
        dataframe['volume_ma'] = dataframe['volume'].rolling(window=20).mean()
        
        # Reference price (peg)
        dataframe['peg'] = 1.0
        
        # Is price below our buy threshold?
        dataframe['below_threshold'] = dataframe['close'] < self.buy_below
        
        # Is price above our sell threshold?
        dataframe['above_threshold'] = dataframe['close'] >= self.sell_above
        
        return dataframe
    
    def populate_entry_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Buy when price drops below threshold
        """
        conditions = [
            # Simple condition: price below threshold
            dataframe['close'] < self.buy_below,
            
            # Make sure there's some volume
            dataframe['volume'] > 0
        ]
        
        dataframe['buy'] = np.where(np.logical_and.reduce(conditions), 1, 0)
        return dataframe
    
    def populate_exit_trend(self, dataframe: DataFrame, metadata: dict) -> DataFrame:
        """
        Sell when price goes back above threshold
        """
        conditions = [
            # Simple condition: price above threshold
            dataframe['close'] >= self.sell_above,
            
            # Make sure there's some volume
            dataframe['volume'] > 0
        ]
        
        dataframe['sell'] = np.where(np.logical_and.reduce(conditions), 1, 0)
        return dataframe
    
    def custom_exit(self, pair: str, trade: Trade, current_time: datetime, current_rate: float,
                   current_profit: float, **kwargs):
        """
        Exit after 60 minutes if trade hasn't hit profit target
        """
        if current_time - trade.open_date_utc > timedelta(minutes=60):
            return 'timeout_exit'
            
        return None