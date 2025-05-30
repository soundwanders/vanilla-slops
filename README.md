# Vanilla Slops

<p align="center">
  <img src="./src/client/public/frogslops.png" alt="Vanilla Slops - Steam Launch Options Discovery" width="160">
</p>

<p align="center">
  <a href="#-features">Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-api-documentation">API</a> •
  <a href="#-contributing">Contributing</a>
</p>

---


### 👖 Vanilla Slops?

**Vanilla Slops** is a web application that provides a searchable database of community-verified launch options for thousands of Steam games. 
The name Vanilla Slops is a nod to the use of vanilla JavaScript, with our back-end powered by Supabase and an Express.js API.

Steam Launch Options (SLOPS) are custom command-line parameters that can improve game performance or unlock features outside of the standard game menus.

<img src="./src/client/public/slops-screenshot.png" alt="Steam Launch Options Screenshot" width="540">

One of the core philosophies of this project is to recreate some of the functionality that modern frameworks abstract away, while remaining lightweight, fast, and secure. 

---

## 🧙 Features

#### **🔎 Smart Search & Discovery**
- **Real-time search suggestions** with (mildly) intelligent autocomplete
- **Multi-field search** across titles, developers, publishers with instant results
- **Advanced filtering** by category, engine, release year, and launch option availability

#### **🎯 Steam Launch Options Database**
- **Community-verified launch options** with upvote/downvote system and reliability scoring
- **Categorized by purpose**: Performance boosting, graphics optimization, compatibility fixes
- **Source attribution** linking back to original documentation and community contributions

#### **🛡️ Code Quality & Safety**
- **Sub-100ms API responses** with intelligent caching and query optimization
- **Accessibility-first design** with semantic HTML and full keyboard navigation
- **Security hardened** with input validation, CORS policies, and rate limiting
- **Type-safe architecture** using Zod schemas throughout the entire stack

---


## 🏗️ Architecture

#### **A Look Under the Hood**
- **Frontend**: Vanilla JavaScript (ES6+) with Vite for development
- **Backend**: Node.js + Express.js with middleware-based architecture
- **Database**: Supabase (PostgreSQL) with optimized queries and indexing
- **Data Collection**: Python-based scraper with Steam API integration

#### **Design Principles**
- ⚡ **Performance First** - Minimal JavaScript bundle, efficient caching, optimized queries
- 🎯 **User-Centric** - Intuitive interface, fast search, accessibility compliance
- 🔧 **Developer Experience** - Clean code, comprehensive documentation, easy setup

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Frontend      │───▶│   Express API    │───▶│   Supabase DB   │
│   (Port 3000)   │    │   (Port 8000)    │    │   PostgreSQL    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
        │                       │                       │
        ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│ • Smart Caching │    │ • Route Handling │    │ • Optimized     │
│ • Real-time UI  │    │ • Validation     │    │   Queries       │
│ • Accessibility │    │ • Error Handling │    │ • Relationships │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/soundwanders/vanilla-slops.git
cd vanilla-slops

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Then, add your Supabase credentials to the new .env file
```

### Environment Configuration

```bash
# Example .env
SUPABASE_URL=your_supabase_project_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
NODE_ENV=development
PORT=8000
CORS_ORIGIN=http://localhost:3000
```

### Development & npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | **Start full dev environment** (client + server) |
| `npm run dev:client` | Start Vite dev server only |
| `npm run dev:server` | Start backend with nodemon only |
| `npm run build` | **Build for production** |
| `npm start` | **Run production server** |
| `npm test` | Run tests (placeholder) |
| `npm run lint` | Check code with ESLint |
| `npm run lint:fix` | Fix ESLint issues automatically |

---

## 📚 API Documentation

### Core Endpoints

### `GET /api/games`
Retrieve games with advanced filtering and pagination.

**Query Parameters:**
- `search` - Search term for games, developers, publishers
- `category` - Filter by game category
- `developer` - Filter by developer name
- `options` - Filter by launch options availability
- `sort` - Sort field (`title`, `year`, `options`)
- `order` - Sort direction (`asc`, `desc`)
- `page` - Page number (default: 1)
- `limit` - Items per page (default: 20, max: 100)

**Response:**
```json
{
  "games": [...],
  "total": 1250,
  "totalPages": 63,
  "currentPage": 1,
  "hasNextPage": true,
  "facets": { "developers": [...], "engines": [...] }
}
```

### `GET /api/games/suggestions`
Get intelligent search suggestions for autocomplete.

### `GET /api/games/:id/launch-options`
Retrieve launch options for a specific game.

### Coming Soon...
[📖 **Full API Documentation**](./docs/api.md)

---


## 🧘 Contributing

Vanilla Slops is a welcoming place, whether you're a first-timer or a seasoned developer I would love to hear your ideas.
It's a great environment to get your feet wet because there's nothing at stake here. 
Your contributions can only make the project better, and maybe we both learn something along the way. 

[📋 **Contributing Guidelines**](./CONTRIBUTING.md) | [🐛 **Issue Templates**](./github/ISSUE_TEMPLATE/)

### **Ways to Contribute**
- 🎮 **Launch Options** - Submit verified launch options for games, so we can grow the database
- 🐛 **Bug Reports** - Issues, broken things, silly things, or things that just don't make no sense
- ✨ **Feature Requests** - Any ideas for new features, or improving on currently implemented features
- 📝 **Documentation** - Help improve our docs and test-coverage

### **Example Workflow**
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes with tests
4. Commit with conventional commits (`git commit -m 'feat: add amazing feature'`)
5. Push to your branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

---


## 🚀 Deployment (WIP - PROJECT IS NOT LIVE)

#### **Production Checklist**
- [ ] Database indexes optimized
- [ ] CORS settings configured for production domain
- [ ] CDN configured for static assets

---


## 📄 License

MIT License - please see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <br/>
  <sub>Built with ❤︎</sub> <br/>
</p>