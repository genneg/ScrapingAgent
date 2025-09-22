import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { websocketService } from '@/lib/websocket';
import { createLogger } from '@/lib/logger';
import 'dotenv/config';

const logger = createLogger('server');
const dev = process.env.NODE_ENV !== 'production';
const port = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const app = next({ dev });
const handle = app.getRequestHandler();

let server: any;

app.prepare().then(() => {
  server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      logger.error('Error occurred handling', { error: err });
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize WebSocket service
  websocketService.initialize(server);

  server.listen(port, () => {
    logger.info(`Server ready on port ${port}`);
  });
});

export { server };