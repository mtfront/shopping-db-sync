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

| Variable | Description | Default |
|----------|-------------|---------|
| `GITHUB_REPO` | Repository `owner/repo` | `mtfront/mtfront` |
| `GITHUB_BRANCH` | Branch name | `main` |
| `BASE_PATH` | Posts directory path | `content/posts` |
| `GITHUB_TOKEN` | GitHub token (for private repos) | `null` |

### GitHub Actions

The workflow (`.github/workflows/parse-spark-joy.yml`) can be:
- **Manually triggered** with a year-month parameter
- **Scheduled** monthly on the 1st at 00:00 UTC
- **Auto-triggered** on pushes to `*spark-joy-digest*.md` files

Results are saved as workflow artifacts.

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
    "linkText": "Link Text",
    "description": "Description text",
    "source": "https://raw.githubusercontent.com/...",
    "yearMonth": "2025-11"
  }
]
```

## Requirements

- Node.js 14.0.0+
