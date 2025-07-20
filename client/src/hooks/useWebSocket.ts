import { useEffect, useRef, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';

interface WebSocketMessage {
  type: string;
  data: any;
}

interface UseWebSocketOptions {
  onMessage?: (message: WebSocketMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  enablePolling?: boolean;
  pollingInterval?: number;
}

export function useWebSocket({ 
  onMessage, 
  onConnect, 
  onDisconnect, 
  enablePolling = true,
  pollingInterval = 3000 
}: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();
  const reconnectAttemptsRef = useRef(0);
  const pollingIntervalRef = useRef<NodeJS.Timeout>();
  const maxReconnectAttempts = 5;
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessageId, setLastMessageId] = useState<number>(0);
  const queryClient = useQueryClient();

  // Polling function to sync messages and online status
  const pollForUpdates = useCallback(async () => {
    try {
      // Poll for online users only (messages will be handled by the Chat component)
      const onlineResponse = await apiRequest('GET', '/api/users/online');
      if (onlineResponse.ok) {
        const onlineUsers = await onlineResponse.json();
        // Update online users in cache or trigger a callback
        if (onMessage) {
          onMessage({
            type: 'online_users_update',
            data: { onlineUsers }
          });
        }
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, [queryClient, onMessage]);

  const connect = useCallback(() => {
    try {
      console.log('Attempting to connect WebSocket...');
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log(`Connecting to WebSocket at: ${wsUrl}`);
      
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        console.log('WebSocket connection established successfully!');
        reconnectAttemptsRef.current = 0;
        setIsConnected(true);
        
        // Stop polling when WebSocket is connected
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = undefined;
        }
        
        onConnect?.();
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          onMessage?.(message);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      wsRef.current.onclose = (event) => {
        console.log(`WebSocket disconnected. Code: ${event.code}, Reason: ${event.reason}`);
        setIsConnected(false);
        onDisconnect?.();
        
        // Start polling if WebSocket fails
        if (enablePolling && !pollingIntervalRef.current) {
          console.log('Starting polling as WebSocket fallback');
          pollForUpdates();
          pollingIntervalRef.current = setInterval(pollForUpdates, pollingInterval);
        }
        
        // Attempt to reconnect
        if (reconnectAttemptsRef.current < maxReconnectAttempts) {
          reconnectAttemptsRef.current++;
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, delay);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error event:', error);
      };
    } catch (error) {
      console.error('Failed to create WebSocket instance:', error);
      
              // Start polling if WebSocket creation fails
        if (enablePolling && !pollingIntervalRef.current) {
          console.log('Starting polling as WebSocket creation failed');
          pollForUpdates();
          pollingIntervalRef.current = setInterval(pollForUpdates, pollingInterval);
        }
    }
  }, [onMessage, onConnect, onDisconnect, enablePolling, pollingInterval, pollForUpdates]);

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected, falling back to HTTP');
      // Fallback to HTTP for critical messages
      if (message.type === 'typing') {
        // For typing indicators, we can skip if WebSocket is down
        return;
      }
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  useEffect(() => {
    connect();
    
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    sendMessage,
    disconnect,
    isConnected,
  };
}
