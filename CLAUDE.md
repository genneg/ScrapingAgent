# SwingRadar Data Import Application - Claude Configuration

## Workflow Essentials

### Pre-Session Checklist

- SEMPRE leggi PLANNING.md all'inizio di ogni sessione
- VERIFICA TASKS.md prima di iniziare qualsiasi lavoro
- AGGIUNGI nuovi task con data corrente se non listati
- SEGNA task completati immediatamente dopo finish

### Session Management

- Context refresh: Rileggi PLANNING.md ogni 10 interazioni
- Task tracking: Aggiorna TASKS.md ad ogni milestone
- Quality check: Valida output contro Quality Gates prima commit
- Documentation: Mantieni README.md aggiornato con progress

## Project Context

### Mission Statement

Sistema completo per acquisizione automatica e gestione dati festival swing/blues:

- AI scraping da URL → JSON strutturato → Database SwingRadar
- Dual workflow: URL scraping + file upload unificati
- Zero breaking changes al sistema esistente

### Core Capabilities

- **AI-Powered Scraping**: Claude API extraction con confidence scoring
- **Data Quality Management**: Multi-level validation pipeline
- **Database Integration**: Prisma ORM con transazioni atomiche
- **Real-time UI**: Progress tracking con WebSocket updates

### Success Metrics

- Scraping: 20+ siti/ora, 85%+ confidence score
- Import: <30s per festival, 99.5% accuracy
- User Experience: 95% reduction lavoro manuale

## Tech Stack

### Core Framework

- **Runtime**: Node.js 18.17.0+
- **Framework**: Next.js 14.2.0 (App Router)
- **Language**: TypeScript 5.3.0+
- **Package Manager**: npm 10.0.0+

### Database & ORM

- **Database**: PostgreSQL 15+ (Supabase hosted)
- **ORM**: Prisma 5.7.0+
- **Connection**: @prisma/client 5.7.0
- **Migrations**: prisma migrate

### UI & Styling

- **React**: 18.2.0+
- **Styling**: Tailwind CSS 3.4.0+
- **Components**: @shadcn/ui latest
- **Icons**: lucide-react 0.263.1+

### AI & Processing

- **LLM Integration**: @anthropic-ai/sdk 0.13.0+
- **File Processing**: multer 1.4.5+
- **Validation**: zod 3.22.0+
- **JSON Parsing**: streaming-json-stringify

### External APIs

- **Geocoding**: @googlemaps/google-maps-services-js 3.3.0+
- **WebSocket**: socket.io 4.7.0+
- **HTTP Client**: axios 1.6.0+

## Code Standards

### File Structure

```
src/
├── app/                 # Next.js App Router
├── components/          # React components
├── lib/                # Utilities & config
├── services/           # Business logic
├── types/              # TypeScript definitions
└── validations/        # Zod schemas
```

### Naming Conventions

- **Files**: kebab-case.tsx, kebab-case.ts
- **Components**: PascalCase (FestivalImport.tsx)
- **Functions**: camelCase (extractFestivalData)
- **Constants**: SCREAMING_SNAKE_CASE
- **Types/Interfaces**: PascalCase (FestivalData)

### TypeScript Rules

- Strict mode enabled sempre
- No `any` types - usa `unknown` se necessario
- Explicit return types per functions pubbliche
- Interface over type per object definitions
- Use branded types per IDs (type FestivalId = string & { \_\_brand: 'FestivalId' })

### Import Organization

```typescript
// 1. React/Next imports
import React from 'react';
import { NextRequest } from 'next/server';

// 2. External libraries
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

// 3. Internal modules
import { ScrapingService } from '@/services/scraping';
import { FestivalData } from '@/types';

// 4. Relative imports
import './styles.css';
```

### Error Handling

- Always use Result<T, E> pattern per operations che possono fallire
- Custom error classes con specific error codes
- Graceful degradation - mai crash applicazione
- Comprehensive logging con structured data

### Database Patterns

- Use transactions per multi-table operations
- Optimistic locking per concurrent updates
- Batch operations per performance
- Connection pooling sempre attivo

## Quality Gates

### Pre-Commit Checks

- [ ] TypeScript compilation passes (tsc --noEmit)
- [ ] ESLint rules pass (npm run lint)
- [ ] Prettier formatting applied (npm run format)
- [ ] Tests pass (npm run test)
- [ ] Database migrations validated

### Code Review Checklist

- [ ] Error handling implemented correttamente
- [ ] Input validation con Zod schemas
- [ ] Database operations use transactions
- [ ] API responses follow standard format
- [ ] WebSocket events properly typed

### Performance Standards

- [ ] API responses < 200ms per simple queries
- [ ] Database queries use appropriate indexes
- [ ] Large file uploads handled con streaming
- [ ] Memory usage < 512MB during processing
- [ ] No memory leaks in long-running operations

### Security Requirements

- [ ] Input sanitization on all user inputs
- [ ] SQL injection prevention (Prisma handles this)
- [ ] Rate limiting on API endpoints
- [ ] Environment variables per sensitive data
- [ ] CORS policy properly configured

## Development Commands

### Setup & Installation

```bash
npm install                    # Install dependencies
npm run db:generate           # Generate Prisma client
npm run db:migrate:dev        # Run database migrations
npm run db:seed               # Seed development data
```

### Development Workflow

```bash
npm run dev                   # Start development server
npm run db:studio             # Open Prisma Studio
npm run lint                  # Run ESLint
npm run format                # Run Prettier
npm run type-check            # TypeScript check
```

### Testing & Validation

```bash
npm run test                  # Run test suite
npm run test:watch           # Watch mode testing
npm run test:coverage        # Coverage report
npm run db:test:reset        # Reset test database
```

### Production Commands

```bash
npm run build                 # Production build
npm run start                 # Production server
npm run db:migrate:deploy     # Production migrations
```

## Environment Configuration

### Required Variables

```bash
# Database
DATABASE_URL="postgresql://..."
DIRECT_URL="postgresql://..."

# External APIs
ANTHROPIC_API_KEY="sk-ant-..."
GOOGLE_MAPS_API_KEY="AIza..."

# Auth (if implemented)
NEXTAUTH_SECRET="..."
NEXTAUTH_URL="http://localhost:3000"

# Development
NODE_ENV="development"
NEXT_PUBLIC_APP_URL="http://localhost:3000"
```

### Optional Variables

```bash
# Logging
LOG_LEVEL="debug"
LOG_FILE="./logs/app.log"

# Performance
MAX_CONCURRENT_SCRAPES="3"
SCRAPING_TIMEOUT="120000"
```

## Debugging Guidelines

### Logging Strategy

- Use structured logging con timestamp e context
- Different log levels: error, warn, info, debug
- Include request IDs per tracing
- Sensitive data redaction automatica

### Common Issues

- **Prisma Connection**: Check DATABASE_URL format
- **API Timeouts**: Verify external service availability
- **Memory Issues**: Monitor large file processing
- **WebSocket Disconnects**: Implement reconnection logic

### Performance Monitoring

- Database query performance (slow query log)
- API response times (middleware logging)
- Memory usage patterns
- Error rate tracking

## Integration Patterns

### API Response Format

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    requestId: string;
  };
}
```

### WebSocket Event Format

```typescript
interface WebSocketEvent<T> {
  type: string;
  payload: T;
  timestamp: string;
  sessionId: string;
}
```

### Database Transaction Pattern

```typescript
const result = await prisma.$transaction(
  async tx => {
    // Multiple operations
    return finalResult;
  },
  {
    maxWait: 5000,
    timeout: 10000,
  }
);
```

## Context Management

### Memory Efficiency

- Rileggi solo sections necessarie quando context si riempie
- Priorità: PLANNING.md > TASKS.md > implementation details
- Use incremental updates invece di full file reads
- Compress long outputs con summaries

### State Tracking

- Current milestone in TASKS.md
- Active development branch
- Recent completions e blockers
- Next priority items

### Documentation Updates

- Update TASKS.md dopo ogni completed item
- Refresh PLANNING.md se architecture changes
- Maintain this file con new patterns discovered
- Keep README.md current per external developers
