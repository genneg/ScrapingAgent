import { Server as NetServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { logger } from './logger';

export interface WebSocketProgress {
  type: 'scraping' | 'validation' | 'import' | 'error';
  stage: string;
  progress: number;
  message: string;
  data?: Record<string, unknown>;
  timestamp: string;
  sessionId?: string; // Added for session identification
}

export interface ScrapingProgress extends WebSocketProgress {
  type: 'scraping';
  stage: 'fetching' | 'analyzing' | 'extracting' | 'validating' | 'completed' | 'error';
  url?: string;
  pagesProcessed?: number;
  totalPages?: number;
  confidence?: number;
}

export interface ValidationProgress extends WebSocketProgress {
  type: 'validation';
  stage: 'schema' | 'business-rules' | 'duplicates' | 'geocoding' | 'completed';
  validationResults?: Record<string, unknown>;
  errorCount?: number;
  warningCount?: number;
}

export interface ImportProgress extends WebSocketProgress {
  type: 'import';
  stage: 'mapping' | 'creating' | 'relating' | 'finalizing' | 'completed';
  entitiesProcessed?: number;
  totalEntities?: number;
  importId?: string;
}

export class WebSocketService {
  private io: SocketIOServer | null = null;
  private activeRooms = new Map<string, Set<string>>();
  private messageQueue: Array<{ sessionId: string; progress: WebSocketProgress }> = [];
  private isInitialized = false;

  /**
   * Initialize WebSocket server with HTTP server
   */
  initialize(server: NetServer) {
    this.io = new SocketIOServer(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production'
          ? process.env.NEXT_PUBLIC_APP_URL
          : ['http://localhost:3000', 'http://localhost:3001'],
        methods: ['GET', 'POST'],
      },
      transports: ['websocket', 'polling'],
    });

    this.io.on('connection', (socket) => {
      logger.info('Client connected', { socketId: socket.id });

      // Handle room joining for session isolation
      socket.on('join-session', (sessionId: string) => {
        socket.join(sessionId);
        this.addToRoom(sessionId, socket.id);
        logger.info('Client joined session', { socketId: socket.id, sessionId });

        // Send confirmation
        socket.emit('session-joined', {
          sessionId,
          message: 'Successfully joined session',
          timestamp: new Date().toISOString(),
        });
      });

      // Handle room leaving
      socket.on('leave-session', (sessionId: string) => {
        socket.leave(sessionId);
        this.removeFromRoom(sessionId, socket.id);
        logger.info('Client left session', { socketId: socket.id, sessionId });
      });

      // Handle custom events
      socket.on('subscribe-progress', (data: { sessionId: string; operationType: string }) => {
        const room = `${data.sessionId}:${data.operationType}`;
        socket.join(room);
        logger.info('Client subscribed to progress', { socketId: socket.id, room });
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        logger.info('Client disconnected', { socketId: socket.id });
        // Clean up from all rooms
        this.activeRooms.forEach((clients, room) => {
          clients.delete(socket.id);
          if (clients.size === 0) {
            this.activeRooms.delete(room);
          }
        });
      });

      // Send welcome message
      socket.emit('connected', {
        message: 'Connected to SwingRadar WebSocket server',
        timestamp: new Date().toISOString(),
        socketId: socket.id,
      });
    });

    this.isInitialized = true;
    logger.info('WebSocket server initialized');

    // Process any queued messages
    this.processMessageQueue();
  }

  /**
   * Send progress update to a specific session
   */
  sendProgress(sessionId: string, progress: WebSocketProgress) {
    if (!this.isInitialized || !this.io) {
      logger.warn('WebSocket server not initialized, queuing message', { sessionId });
      this.messageQueue.push({ sessionId, progress });
      return;
    }

    const room = sessionId;
    this.io.to(room).emit('progress-update', {
      ...progress,
      sessionId,
    });

    logger.debug('Progress update sent', { sessionId, progress });
  }

  /**
   * Process queued messages after initialization
   */
  private processMessageQueue() {
    if (!this.isInitialized || !this.io) {
      return;
    }

    const messagesToProcess = [...this.messageQueue];
    this.messageQueue = [];

    messagesToProcess.forEach(({ sessionId, progress }) => {
      try {
        const room = sessionId;
        this.io!.to(room).emit('progress-update', {
          ...progress,
          sessionId,
        });
        logger.debug('Queued progress update sent', { sessionId, progress });
      } catch (error) {
        logger.error('Failed to send queued message', { sessionId, error });
      }
    });

    if (messagesToProcess.length > 0) {
      logger.info(`Processed ${messagesToProcess.length} queued WebSocket messages`);
    }
  }

  /**
   * Send scraping progress
   */
  sendScrapingProgress(sessionId: string, progress: ScrapingProgress) {
    this.sendProgress(sessionId, progress);
  }

  /**
   * Send validation progress
   */
  sendValidationProgress(sessionId: string, progress: ValidationProgress) {
    this.sendProgress(sessionId, progress);
  }

  /**
   * Send import progress
   */
  sendImportProgress(sessionId: string, progress: ImportProgress) {
    this.sendProgress(sessionId, progress);
  }

  /**
   * Send error message
   */
  sendError(sessionId: string, error: {
    code: string;
    message: string;
    details?: any;
    operation?: string;
  }) {
    if (!this.isInitialized || !this.io) {
      logger.warn('WebSocket server not initialized, queuing error message', { sessionId });
      this.messageQueue.push({
        sessionId,
        progress: {
          type: 'error',
          stage: 'error',
          progress: 0,
          message: error.message,
          timestamp: new Date().toISOString(),
        }
      });
      return;
    }

    this.io.to(sessionId).emit('error', {
      ...error,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    logger.error('Error sent via WebSocket', { sessionId, error });
  }

  /**
   * Send completion message
   */
  sendCompletion(sessionId: string, data: {
    operation: string;
    result: any;
    summary?: any;
  }) {
    if (!this.io) {
      logger.warn('WebSocket server not initialized');
      return;
    }

    this.io.to(sessionId).emit('completion', {
      ...data,
      sessionId,
      timestamp: new Date().toISOString(),
    });

    logger.info('Completion sent via WebSocket', { sessionId, operation: data.operation });
  }

  /**
   * Broadcast to all connected clients
   */
  broadcast(event: string, data: any) {
    if (!this.isInitialized || !this.io) {
      logger.warn('WebSocket server not initialized, cannot broadcast');
      return;
    }

    this.io.emit(event, {
      ...data,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get active sessions count
   */
  getActiveSessionsCount(): number {
    return this.activeRooms.size;
  }

  /**
   * Check if session has active connections
   */
  isSessionActive(sessionId: string): boolean {
    const room = this.activeRooms.get(sessionId);
    return room ? room.size > 0 : false;
  }

  /**
   * Check if WebSocket service is initialized
   */
  isReady(): boolean {
    return this.isInitialized && this.io !== null;
  }

  private addToRoom(room: string, socketId: string) {
    if (!this.activeRooms.has(room)) {
      this.activeRooms.set(room, new Set());
    }
    this.activeRooms.get(room)!.add(socketId);
  }

  private removeFromRoom(room: string, socketId: string) {
    const clients = this.activeRooms.get(room);
    if (clients) {
      clients.delete(socketId);
      if (clients.size === 0) {
        this.activeRooms.delete(room);
      }
    }
  }
}

// Global singleton instance - stored on global object to survive Next.js module reloading
const GLOBAL_WEBSOCKET_SERVICE_KEY = 'swingradar_websocket_service';

function getGlobalWebSocketService(): WebSocketService {
  // @ts-ignore - accessing global object
  if (!global[GLOBAL_WEBSOCKET_SERVICE_KEY]) {
    // @ts-ignore
    global[GLOBAL_WEBSOCKET_SERVICE_KEY] = new WebSocketService();
  }
  // @ts-ignore
  return global[GLOBAL_WEBSOCKET_SERVICE_KEY];
}

// Export singleton instance that survives Next.js module reloading
export const websocketService = getGlobalWebSocketService();