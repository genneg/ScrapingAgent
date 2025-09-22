'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { ScrapingProgress, ValidationProgress, ImportProgress } from '@/lib/websocket';

interface WebSocketHookReturn {
  isConnected: boolean;
  connect: (sessionId: string) => void;
  disconnect: () => void;
  lastProgress: ScrapingProgress | ValidationProgress | ImportProgress | null;
  error: string | null;
}

export function useWebSocket(): WebSocketHookReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [lastProgress, setLastProgress] = useState<ScrapingProgress | ValidationProgress | ImportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000;

  const connect = useCallback((sessionId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }

    sessionIdRef.current = sessionId;
    setError(null);
    reconnectAttemptsRef.current = 0;

    try {
      const socket = io(process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000', {
        transports: ['websocket', 'polling'],
        timeout: 10000,
        reconnection: true,
        reconnectionAttempts: MAX_RECONNECT_ATTEMPTS,
        reconnectionDelay: RECONNECT_DELAY,
      });

      socketRef.current = socket;

      // Connection events
      socket.on('connect', () => {
        console.log('WebSocket connected:', socket.id);
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;

        // Join session room
        if (sessionIdRef.current) {
          socket.emit('join-session', sessionIdRef.current);
        }
      });

      socket.on('disconnect', (reason) => {
        console.log('WebSocket disconnected:', reason);
        setIsConnected(false);

        // Attempt to reconnect if not manually disconnected
        if (reason !== 'io client disconnect' && reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          reconnectAttemptsRef.current++;
          console.log(`Reconnection attempt ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS}`);
        }
      });

      socket.on('connect_error', (err) => {
        console.error('WebSocket connection error:', err);
        setError(`Connection failed: ${err.message}`);
        setIsConnected(false);
      });

      // Progress updates
      socket.on('progress-update', (progress: ScrapingProgress | ValidationProgress | ImportProgress) => {
        console.log('Progress update received:', progress);
        setLastProgress(progress);
      });

      // Error messages
      socket.on('error', (errorData) => {
        console.error('WebSocket error received:', errorData);
        setError(errorData.message || 'Unknown error occurred');
      });

      // Completion messages
      socket.on('completion', (completionData) => {
        console.log('Operation completed:', completionData);
        // You can handle completion logic here
      });

      // Session management
      socket.on('session-joined', (data) => {
        console.log('Session joined:', data);
      });

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create WebSocket connection';
      setError(errorMessage);
      setIsConnected(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsConnected(false);
    sessionIdRef.current = null;
    setError(null);
    setLastProgress(null);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected,
    connect,
    disconnect,
    lastProgress,
    error,
  };
}