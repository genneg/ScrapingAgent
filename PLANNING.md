# SwingRadar Data Import Application - Strategic Planning

## Vision

Transform manual festival data entry into automated intelligence: AI agent scrapes any festival website → validates and structures data → imports to SwingRadar database with zero human intervention and 99.5% accuracy.

Enable scaling from 10-20 festivals/month to 100+ with 95% reduction in manual work while maintaining complete data quality control.

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────┐
│                 Web Interface Layer                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ URL Scraper │  │ File Upload │  │ Progress Track  │  │
│  │ Dashboard   │  │ Interface   │  │ Dashboard       │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │ WebSocket + REST API
┌─────────────────────▼───────────────────────────────────┐
│              Unified Processing Engine                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ AI Scraping │  │ Validation  │  │ Quality Control │  │
│  │ Service     │  │ Pipeline    │  │ Gates           │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐  │
│  │ Data Mapper │  │ Geocoding   │  │ Duplicate       │  │
│  │ Service     │  │ Service     │  │ Detection       │  │
│  └─────────────┘  └─────────────┘  └─────────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │ Prisma ORM
┌─────────────────────▼───────────────────────────────────┐
│              SwingRadar Database                        │
│     (PostgreSQL on Supabase - Zero Changes)            │
└─────────────────────────────────────────────────────────┘
```

### Core Components

#### 1. AI Scraping Service

- **Purpose**: Extract festival data from websites using Claude API
- **Input**: Festival website URL
- **Output**: Structured JSON matching database schema
- **Features**: Multi-page exploration, confidence scoring, style transformation

#### 2. Validation Pipeline

- **Purpose**: Multi-level data quality assurance
- **Stages**: Schema validation → Business rules → Duplicate detection → Geocoding
- **Error Handling**: Auto-fix capabilities, graceful degradation, detailed reporting

#### 3. Database Integration Layer

- **Purpose**: Atomic import with full transaction support
- **Pattern**: Upsert entities → Create relationships → Validate constraints
- **Safety**: Full rollback on any failure, zero impact on existing data

#### 4. Real-time Communication

- **WebSocket**: Live progress updates, error notifications, completion events
- **REST API**: CRUD operations, status checks, data preview
- **Events**: Scraping progress, validation results, import completion

### Data Flow Architecture

#### Scraping Workflow

```
URL Input → Website Analysis → Content Extraction → JSON Generation
    ↓              ↓                   ↓               ↓
Validate URL   Parse Pages        Apply Prompt     Schema Check
              (3-15 pages)      (1940s style)    (Confidence)
```

#### Import Workflow

```
JSON Data → Validation → Entity Mapping → Database Import
    ↓           ↓             ↓              ↓
Schema Check  Business    Prisma Models   Transaction
Quality Gate  Rules Gate  Relationship    Execution
             Duplicate     Management
             Detection
```

#### Error Recovery Flow

```
Error Detection → Classification → Auto-Fix Attempt → Manual Review Queue
       ↓              ↓               ↓                    ↓
   Log Context    Critical vs     Apply Fixes        User Decision
   Stack Trace    Recoverable     Where Possible     Required
```

## Tech Stack

### Backend Framework

- **Next.js**: 14.2.0 (App Router)
- **TypeScript**: 5.3.0+
- **Node.js**: 18.17.0+
- **Runtime**: Edge runtime for API routes where possible

### Database & ORM

- **PostgreSQL**: 15+ (Supabase managed)
- **Prisma**: 5.7.0+ (ORM + migrations)
- **Connection Pooling**: Supabase pooler
- **Schema**: Zero changes to existing SwingRadar tables

### AI & Processing

- **Anthropic Claude**: Latest API via @anthropic-ai/sdk 0.13.0+
- **File Processing**: Multer 1.4.5+ for JSON uploads
- **Validation**: Zod 3.22.0+ for schema validation
- **Geocoding**: Google Maps API via @googlemaps/google-maps-services-js

### Frontend & UI

- **React**: 18.2.0+ with concurrent features
- **Tailwind CSS**: 3.4.0+ for styling
- **shadcn/ui**: Latest for component library
- **Real-time**: Socket.io 4.7.0+ for WebSocket

### Development Tools

- **ESLint**: 8.0+ with TypeScript rules
- **Prettier**: 3.0+ for code formatting
- **Jest**: 29.0+ for testing
- **Playwright**: E2E testing for critical workflows

## Infrastructure

### Deployment Platform

- **Primary**: Vercel (Next.js optimized)
- **Database**: Existing Supabase instance
- **File Storage**: Vercel Blob for temporary uploads
- **CDN**: Vercel Edge Network

### Environment Configuration

- **Development**: Local Next.js server + Supabase connection
- **Staging**: Vercel preview deployments
- **Production**: Vercel production + production Supabase

### External Services

- **Claude API**: Primary AI processing (pay-per-use)
- **Google Maps**: Geocoding service (API key required)
- **Supabase**: Database hosting (existing infrastructure)

### Monitoring & Observability

- **Error Tracking**: Sentry for production error monitoring
- **Performance**: Vercel Analytics for web vitals
- **Logging**: Custom structured logging with Winston
- **Metrics**: Custom dashboard for scraping success rates

## Constraints

### Technical Limitations

- **Database**: Zero breaking changes to existing SwingRadar schema
- **Performance**: Scraping must complete <2 minutes, import <30 seconds
- **Concurrency**: Max 3 simultaneous scraping operations
- **Memory**: <512MB usage during processing
- **API Limits**: Claude API rate limits, Google Maps quotas

### Business Requirements

- **Accuracy**: 99.5% data precision required
- **Availability**: 99.5% uptime during business hours
- **Security**: No sensitive data exposure, input sanitization
- **Compliance**: GDPR considerations for scraped public data
- **Backward Compatibility**: Must work with existing SwingRadar workflows

### Development Constraints

- **Timeline**: 8 weeks total development time
- **Team Size**: Single developer (Claude Code assisted)
- **Budget**: Minimal external service costs
- **Maintenance**: Low maintenance architecture preferred

### Data Quality Constraints

- **Source Validation**: Only scrape publicly available festival data
- **Content Style**: Must maintain elegant 1940s presenter voice
- **Language**: All content must be translated to English
- **Completeness**: Required fields must be populated or flagged

### Integration Constraints

- **Authentication**: Use existing SwingRadar auth system
- **Permissions**: Admin-only access to import functionality
- **Data Ownership**: Respect existing data ownership patterns
- **Audit Trail**: Full logging of all data changes

## Risk Mitigation

### Technical Risks

- **AI Reliability**: Implement confidence scoring and human review for low-quality extractions
- **Rate Limits**: Implement smart retry logic and usage monitoring
- **Database Performance**: Use connection pooling and optimized queries
- **Memory Issues**: Stream processing for large files

### Business Risks

- **Data Quality**: Multi-stage validation with rollback capabilities
- **User Adoption**: Intuitive UI design and comprehensive documentation
- **Legal Issues**: Only scrape public data, respect robots.txt
- **Cost Overruns**: Monitor API usage and implement budgets

### Operational Risks

- **Service Dependencies**: Graceful degradation when external services fail
- **Data Loss**: Comprehensive backup strategy and transaction safety
- **Security Breaches**: Input validation and secure coding practices
- **Performance Degradation**: Monitoring and automatic scaling
