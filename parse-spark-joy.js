#!/usr/bin/env node

/**
 * GitHub Workflow script to parse spark-joy-digest markdown files
 * Extracts entries from the "物" section with title, link, and description
 */

// Load environment variables from .env file (only in local development)
require('dotenv').config();

const https = require('https');
const { URL } = require('url');
const { Client } = require('@notionhq/client');

// Configuration
const GITHUB_REPO = 'mtfront/mtfront';
const GITHUB_BRANCH = 'main';
const BASE_PATH = 'content/posts';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || null;
const NOTION_TOKEN = process.env.NOTION_TOKEN || null;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID || null;

/**
 * Fetch content from a URL
 */
function fetchUrl(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const requestOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        'User-Agent': 'spark-joy-parser/1.0'
      }
    };
    
    // Add authorization header if token is provided
    if (options.token) {
      requestOptions.headers['Authorization'] = `token ${options.token}`;
    }
    
    https.get(requestOptions, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}: ${res.statusCode} ${res.statusMessage}`));
        return;
      }
      
      // Set encoding to UTF-8 to properly handle multi-byte characters
      res.setEncoding('utf8');
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve(data);
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Fetch list of files from GitHub API
 */
async function fetchFileList(year, month, token = null) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/contents/${BASE_PATH}/${year}-${month}`;
  
  try {
    const response = await fetchUrl(url, { token });
    const files = JSON.parse(response);
    
    // Handle both file objects and arrays
    const fileList = Array.isArray(files) ? files : [files];
    
    // Filter for spark-joy-digest files
    return fileList
      .filter(file => 
        file.name && 
        file.name.includes('spark-joy-digest') && 
        file.name.endsWith('.md')
      )
      .map(file => file.download_url || file.download_url);
  } catch (error) {
    console.error(`Error fetching file list: ${error.message}`);
    return [];
  }
}

/**
 * Extract rating from title and map to numeric value
 * 🤩=5, 👍=4, 🤷=3, 👎=2, 🤮=1
 */
function extractRating(title) {
  const ratingMap = {
    '🤩': 5,
    '👍': 4,
    '🤷': 3,
    '👎': 2,
    '🤮': 1
  };
  
  for (const [emoji, rating] of Object.entries(ratingMap)) {
    if (title.includes(emoji)) {
      return rating;
    }
  }
  
  return 3; // default rating to 3
}

/**
 * Remove rating emojis from title
 */
function cleanTitle(title) {
  const ratingEmojis = ['🤩', '👍', '🤷', '👎', '🤮'];
  let cleaned = title;
  for (const emoji of ratingEmojis) {
    cleaned = cleaned.replace(new RegExp(emoji, 'g'), '');
  }
  return cleaned.trim();
}

/**
 * Parse markdown content to extract "物" section entries
 */
function parseWuSection(content) {
  const lines = content.split('\n');
  const entries = [];
  
  let inWuSection = false;
  let currentEntry = null;
  let entryLines = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();
    
    // Check if we're entering the "物" section
    if (trimmedLine === '## 物' || trimmedLine.startsWith('## 物')) {
      inWuSection = true;
      continue;
    }
    
    // Check if we're leaving the "物" section (next ## heading)
    if (inWuSection && trimmedLine.startsWith('## ') && !trimmedLine.startsWith('## 物')) {
      // Save last entry if exists
      if (currentEntry) {
        currentEntry.description = entryLines.join(' ').trim();
        entries.push(currentEntry);
        currentEntry = null; // Clear to prevent duplicate save at end
      }
      break;
    }
    
    if (!inWuSection) continue;
    
    // Skip empty lines at the start of section
    if (!trimmedLine && !currentEntry) continue;
    
    // Parse entry lines
    // Format 1: ### [Title](url) - heading with link
    // Format 2: - `title` [link text](url) description - bullet point with backticks
    const headingMatch = trimmedLine.match(/^###\s+\[([^\]]+)\]\(([^)]+)\)/);
    const bulletMatch = trimmedLine.match(/^-\s*`([^`]+)`(?:\s+\[([^\]]+)\]\(([^)]+)\))?\s*(.*)$/);
    
    if (headingMatch) {
      // Save previous entry if exists
      if (currentEntry) {
        currentEntry.description = entryLines.join(' ').trim();
        entries.push(currentEntry);
      }
      
      // Start new entry from heading
      const rawTitle = headingMatch[1].trim();
      const cleanTitleText = cleanTitle(rawTitle);
      currentEntry = {
        title: cleanTitleText,
        link: headingMatch[2].trim(),
        description: '',
        rating: extractRating(rawTitle)
      };
      entryLines = [];
    } else if (bulletMatch) {
      // Save previous entry if exists
      if (currentEntry) {
        currentEntry.description = entryLines.join(' ').trim();
        entries.push(currentEntry);
      }
      
      // Start new entry from bullet point
      const rawBulletTitle = bulletMatch[1].trim();
      const cleanBulletTitle = cleanTitle(rawBulletTitle);
      currentEntry = {
        title: cleanBulletTitle,
        link: bulletMatch[3] ? bulletMatch[3].trim() : null,
        description: '',
        rating: extractRating(rawBulletTitle)
      };
      entryLines = [];
      
      // Add description if present on same line
      if (bulletMatch[4] && bulletMatch[4].trim()) {
        entryLines.push(bulletMatch[4].trim());
      }
    } else if (currentEntry) {
      // Continuation of description
      if (trimmedLine) {
        // Check if this is a new entry starting (another heading or bullet point)
        if (trimmedLine.startsWith('###') || (trimmedLine.startsWith('-') && trimmedLine.includes('`'))) {
          // Save current entry and start new one
          currentEntry.description = entryLines.join(' ').trim();
          entries.push(currentEntry);
          
          // Try to parse this line as new entry
          const newHeadingMatch = trimmedLine.match(/^###\s+\[([^\]]+)\]\(([^)]+)\)/);
          const newBulletMatch = trimmedLine.match(/^-\s*`([^`]+)`(?:\s+\[([^\]]+)\]\(([^)]+)\))?\s*(.*)$/);
          
          if (newHeadingMatch) {
            const rawNewTitle = newHeadingMatch[1].trim();
            const cleanNewTitle = cleanTitle(rawNewTitle);
            currentEntry = {
              title: cleanNewTitle,
              link: newHeadingMatch[2].trim(),
              description: '',
              rating: extractRating(rawNewTitle)
            };
            entryLines = [];
          } else if (newBulletMatch) {
            const rawNewBulletTitle = newBulletMatch[1].trim();
            const cleanNewBulletTitle = cleanTitle(rawNewBulletTitle);
            currentEntry = {
              title: cleanNewBulletTitle,
              link: newBulletMatch[3] ? newBulletMatch[3].trim() : null,
              description: '',
              rating: extractRating(rawNewBulletTitle)
            };
            entryLines = [];
            if (newBulletMatch[4] && newBulletMatch[4].trim()) {
              entryLines.push(newBulletMatch[4].trim());
            }
          } else {
            // Not a valid entry, treat as description continuation
            entryLines.push(trimmedLine);
          }
        } else if (!trimmedLine.startsWith('{{') && 
                   !trimmedLine.startsWith('![') && 
                   trimmedLine !== '<--->' &&
                   !trimmedLine.match(/^<---/)) {
          // Regular description continuation (skip markdown shortcodes, images, and separators)
          entryLines.push(trimmedLine);
        }
      }
    }
  }
  
  // Save last entry
  if (currentEntry) {
    currentEntry.description = entryLines.join(' ').trim();
    entries.push(currentEntry);
  }
  
  return entries;
}

/**
 * Add entries to Notion database
 */
async function addToNotion(entries) {
  if (!NOTION_TOKEN || !NOTION_DATABASE_ID) {
    console.log('Notion integration skipped: NOTION_TOKEN or NOTION_DATABASE_ID not set');
    return;
  }

  const notion = new Client({ auth: NOTION_TOKEN });

  // Fetch existing pages to check for duplicates
  const existingPages = new Map();
  try {
    let hasMore = true;
    let startCursor = undefined;
    
    while (hasMore) {
      const response = await notion.databases.query({
        database_id: NOTION_DATABASE_ID,
        start_cursor: startCursor,
        page_size: 100
      });
      
      for (const page of response.results) {
        const titleProperty = page.properties['Name'];
        if (titleProperty && titleProperty.title && titleProperty.title.length > 0) {
          const title = titleProperty.title[0].plain_text;
          existingPages.set(title, page.id);
        }
      }
      
      hasMore = response.has_more;
      startCursor = response.next_cursor;
    }
  } catch (error) {
    console.error(`  ⚠ Failed to fetch existing pages: ${error.message}`);
  }

  for (const entry of entries) {
    try {
      const entryTitle = entry.title || 'Untitled';
      const existingPageId = existingPages.get(entryTitle);
      
      const properties = {};

      // Add rating (推荐度) if present - map to select option
      if (entry.rating !== null && entry.rating !== undefined) {
        const ratingMap = {
          5: '🤩',
          4: '👍',
          3: '🤷',
          2: '👎',
          1: '🤮'
        };
        const ratingOption = ratingMap[entry.rating];
        if (ratingOption) {
          properties['推荐度'] = {
            select: {
              name: ratingOption
            }
          };
        }
      }

      // Add link (购买链接) if present
      if (entry.link) {
        properties['购买链接'] = {
          url: entry.link
        };
      }

      // Only add description (简介) if entry doesn't exist
      if (!existingPageId && entry.description) {
        properties['简介'] = {
          rich_text: [
            {
              text: {
                content: entry.description
              }
            }
          ]
        };
      }

      if (existingPageId) {
        // Update existing page (without description)
        if (Object.keys(properties).length > 0) {
          await notion.pages.update({
            page_id: existingPageId,
            properties: properties
          });
          console.log(`  ↻ Updated in Notion: ${entryTitle} (description preserved)`);
        } else {
          console.log(`  ⊘ Skipped (exists, no changes): ${entryTitle}`);
        }
      } else {
        // Create new page
        properties['Name'] = {
          title: [
            {
              text: {
                content: entryTitle
              }
            }
          ]
        };
        
        await notion.pages.create({
          parent: {
            database_id: NOTION_DATABASE_ID
          },
          properties: properties
        });
        console.log(`  ✓ Added to Notion: ${entryTitle}`);
      }
    } catch (error) {
      console.error(`  ✗ Failed to process "${entry.title}" in Notion: ${error.message}`);
    }
  }
}

/**
 * Main function to process files
 */
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.error('Usage: node parse-spark-joy.js <year-month> [year-month2] ...');
    console.error('   or: node parse-spark-joy.js <url>');
    console.error('Example: node parse-spark-joy.js 2025-11');
    console.error('Example: node parse-spark-joy.js https://raw.githubusercontent.com/mtfront/mtfront/main/content/posts/2025-11/6-spark-joy-digest-2025-11.md');
    process.exit(1);
  }
  
  const allEntries = [];
  
  for (const arg of args) {
    // Check if argument is a URL
    if (arg.startsWith('http://') || arg.startsWith('https://')) {
      try {
        console.log(`Processing URL: ${arg}...`);
        const content = await fetchUrl(arg, { token: GITHUB_TOKEN });
        const entries = parseWuSection(content);
        
        entries.forEach(entry => {
          entry.source = arg;
        });
        
        allEntries.push(...entries);
        console.log(`  Found ${entries.length} entries`);
      } catch (error) {
        console.error(`  Error processing ${arg}: ${error.message}`);
      }
      continue;
    }
    
    // Otherwise treat as year-month
    const yearMonth = arg;
    const [year, month] = yearMonth.split('-');
    
    if (!year || !month) {
      console.error(`Invalid year-month format: ${yearMonth}. Expected format: YYYY-MM`);
      continue;
    }
    
    console.log(`Processing ${yearMonth}...`);
    
    // Try to fetch file list first
    const fileUrls = await fetchFileList(year, month, GITHUB_TOKEN);
    
    // If file list fetch fails, try direct URL pattern
    let urls = fileUrls;
    if (urls.length === 0) {
      // Try common patterns
      const patterns = [
        `${year}-${month}/6-spark-joy-digest-${year}-${month}.md`,
        `${year}-${month}/spark-joy-digest-${year}-${month}.md`,
      ];
      
      for (const pattern of patterns) {
        const testUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_BRANCH}/${BASE_PATH}/${pattern}`;
        try {
          await fetchUrl(testUrl, { token: GITHUB_TOKEN });
          urls = [testUrl];
          break;
        } catch (e) {
          // Continue to next pattern
        }
      }
    }
    
    if (urls.length === 0) {
      console.error(`No files found for ${yearMonth}`);
      continue;
    }
    
    // Process each file
    for (const url of urls) {
      try {
        console.log(`  Fetching ${url}...`);
        const content = await fetchUrl(url, { token: GITHUB_TOKEN });
        const entries = parseWuSection(content);
        
        entries.forEach(entry => {
          entry.source = url;
          entry.yearMonth = yearMonth;
        });
        
        allEntries.push(...entries);
        console.log(`  Found ${entries.length} entries`);
      } catch (error) {
        console.error(`  Error processing ${url}: ${error.message}`);
      }
    }
  }
  
  // Output results as JSON
  console.log('\n=== Results ===');
  console.log(JSON.stringify(allEntries, null, 2));
  
  // Also output summary
  console.log(`\nTotal entries found: ${allEntries.length}`);
  
  // Add to Notion if configured
  if (allEntries.length > 0) {
    console.log('\n=== Adding to Notion ===');
    await addToNotion(allEntries);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { parseWuSection, fetchUrl };

