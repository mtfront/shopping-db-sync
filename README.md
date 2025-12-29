# Spark Joy Digest Parser

Parse markdown files from GitHub and extract entries from the "物" section of spark-joy-digest blog posts.

## Usage

### Command Line

```bash
# Parse by year-month
node parse-spark-joy.js 2025-11

# Parse multiple months
node parse-spark-joy.js 2025-11 2025-10

# Parse by direct URL
node parse-spark-joy.js https://raw.githubusercontent.com/mtfront/mtfront/main/content/posts/2025-11/6-spark-joy-digest-2025-11.md
```

### Environment Variables

Environment variables can be set via:
- `.env` file (loaded automatically when running locally)
- System environment variables (takes precedence over `.env`)

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_REPO` | GitHub repository `owner/repo` | `mtfront/mtfront` |
| `NOTION_TOKEN` | Notion API token | `null` |
| `NOTION_DATABASE_ID` | Notion database ID | `null` |

Create a `.env` file in the project root (see `.env.example` for template).

### GitHub Actions

The workflow (`.github/workflows/parse-spark-joy.yml`) can be:
- **Manually triggered** with a year-month parameter
- **Scheduled** weekly on Monday at 00:00 UTC
- **Auto-triggered** on pushes to `*spark-joy-digest*.md` files

Results are saved as workflow artifacts.

### Notion Integration

If `NOTION_TOKEN` and `NOTION_DATABASE_ID` are set, parsed entries are automatically added to the Notion database with the following field mappings:

- `title` → **Name** (Title field)
- `rating` → **推荐度** (Number field)
- `link` → **购买链接** (URL field)
- `description` → **简介** (Rich text field)

## Input Format

Markdown files should have a "物" section:

```markdown
## 物

- `Item Title` [Link Text](https://example.com) Description
- `Another Item` Description without link
- `Item with Link Only` [Link Text](https://example.com)
```

Supports entries with or without links, and multi-line descriptions.

## Output Format

JSON array with entries:

```json
[
  {
    "title": "Item Title",
    "link": "https://example.com",
    "description": "Description text",
    "rating": 5,
    "source": "https://raw.githubusercontent.com/...",
    "yearMonth": "2025-11"
  }
]
```

## Requirements

- Node.js 14.0.0+
- `npm install` to install dependencies (including `@notionhq/client`)
