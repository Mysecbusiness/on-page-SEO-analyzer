const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const { minify } = require('html-minifier');

const app = express();
const PORT = 3000;

app.use(express.json());

async function fetchPage(url) {
    const { data } = await axios.get(url);
    return minify(data, { collapseWhitespace: true });
}

app.post('/analyze', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const seoData = await analyzePage(url);
        res.json(seoData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching or analyzing the page' });
    }
});

async function analyzePage(url) {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);

    const seoData = {
        title: analyzeTitle($),
        metaDescription: analyzeMetaDescription($),
        headings: analyzeHeadings($),
        keywordDensity: getKeywordDensity($),
        images: checkImages($),
        internalLinks: analyzeLinks($, true),
        externalLinks: analyzeLinks($, false),
        urlStructure: analyzeURL(url),
        contentLength: analyzeContentLength($),
        mobileFriendliness: checkMobileFriendly($),
        pageLoadSpeed: await checkPageLoadSpeed(url),
        schemaMarkup: analyzeSchemaMarkup($),
        canonicalTags: analyzeCanonicalTags($),
        robotsMetaTag: analyzeRobotsMetaTag($),
        readability: analyzeReadability($),
        socialTags: analyzeSocialTags($),
        favicon: checkFavicon($),
        brokenLinks: await checkBrokenLinks($),
        contentUniqueness: await checkContentUniqueness($, url),
        languageTag: checkLanguageTag($),
    };

    return seoData;
}

function analyzeTitle($) {
    const title = $('title').text();
    return {
        presence: title.length > 0,
        length: title.length,
        content: title,
    };
}

function analyzeMetaDescription($) {
    const metaDescription = $('meta[name="description"]').attr('content');
    return {
        presence: !!metaDescription,
        length: metaDescription ? metaDescription.length : 0,
        content: metaDescription || 'No meta description',
    };
}

function analyzeHeadings($) {
    const headings = {};
    $('h1, h2, h3, h4, h5, h6').each((index, element) => {
        const tagName = $(element).prop('tagName').toLowerCase();
        const text = $(element).text().trim();
        if (!headings[tagName]) {
            headings[tagName] = [];
        }
        headings[tagName].push(text);
    });
    return headings;
}

function getKeywordDensity($) {
    const bodyText = $('body').text().toLowerCase();
    const words = bodyText.match(/\b(\w+)\b/g);
    const wordCount = words.length;
    const frequency = {};

    words.forEach(word => (frequency[word] = (frequency[word] || 0) + 1));

    const density = Object.entries(frequency)
        .map(([word, count]) => ({ word, density: (count / wordCount) * 100 }))
        .sort((a, b) => b.density - a.density);

    return density.slice(0, 10);
}

function checkImages($) {
    const images = [];
    $('img').each((i, img) => {
        const alt = $(img).attr('alt');
        images.push({
            src: $(img).attr('src'),
            alt: alt || 'Missing alt attribute',
        });
    });
    return images;
}

function analyzeLinks($, isInternal) {
    const links = [];
    $('a').each((i, link) => {
        const href = $(link).attr('href');
        if (href) {
            const isExternalLink = !href.startsWith('/') && !href.includes(new URL(url).origin);
            if (isInternal ? !isExternalLink : isExternalLink) {
                links.push({
                    href,
                    text: $(link).text().trim(),
                    isExternal: isExternalLink,
                });
            }
        }
    });
    return links;
}

function analyzeURL(url) {
    const urlObj = new URL(url);
    return {
        isReadable: urlObj.pathname.split('/').length <= 3,
        hasKeywords: /[a-zA-Z0-9]/.test(urlObj.pathname),
    };
}

function analyzeContentLength($) {
    const contentLength = $('body').text().trim().split(/\s+/).length;
    return {
        length: contentLength,
        recommended: contentLength >= 300,
    };
}

function checkMobileFriendly($) {
    const viewport = $('meta[name="viewport"]').attr('content');
    return {
        hasViewport: !!viewport,
        isResponsive: viewport && viewport.includes('width=device-width'),
    };
}

async function checkPageLoadSpeed(url) {
    return {
        speedScore: 'N/A',
        recommendations: []
    };
}

function analyzeSchemaMarkup($) {
    const scripts = $('script[type="application/ld+json"]');
    const schemas = [];
    scripts.each((i, script) => {
        schemas.push(JSON.parse($(script).html()));
    });
    return schemas.length > 0 ? schemas : 'No schema markup found';
}

function analyzeCanonicalTags($) {
    const canonical = $('link[rel="canonical"]').attr('href');
    return {
        presence: !!canonical,
        content: canonical || 'No canonical tag found',
    };
}

function analyzeRobotsMetaTag($) {
    const robots = $('meta[name="robots"]').attr('content');
    return {
        presence: !!robots,
        content: robots || 'No robots meta tag found',
    };
}

function analyzeReadability($) {
    const bodyText = $('body').text().trim();
    const wordCount = bodyText.split(/\s+/).length;
    const sentenceCount = bodyText.split(/[.!?]+/).length - 1;
    const readabilityScore = (wordCount / sentenceCount).toFixed(2);
    return {
        score: readabilityScore,
        recommended: readabilityScore < 20,
    };
}

function analyzeSocialTags($) {
    const socialTags = {
        openGraph: [],
        twitterCard: [],
    };

    $('meta[property^="og:"]').each((i, tag) => {
        socialTags.openGraph.push({
            property: $(tag).attr('property'),
            content: $(tag).attr('content'),
        });
    });

    $('meta[name^="twitter:"]').each((i, tag) => {
        socialTags.twitterCard.push({
            name: $(tag).attr('name'),
            content: $(tag).attr('content'),
        });
    });

    return socialTags;
}

function checkFavicon($) {
    const favicon = $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href');
    return {
        presence: !!favicon,
        content: favicon || 'No favicon found',
    };
}

async function checkBrokenLinks($) {
    const links = [];
    $('a').each((i, link) => {
        const href = $(link).attr('href');
        if (href) links.push(href);
    });

    const brokenLinks = [];
    for (const link of links) {
        try {
            await axios.get(link);
        } catch {
            brokenLinks.push(link);
        }
    }
    return brokenLinks;
}

// async function checkContentUniqueness($, url) {
//     return {
//         unique: 'N/A',
//         message: 'Uniqueness check not implemented',
//     };
// }

function checkLanguageTag($) {
    const lang = $('html').attr('lang');
    return {
        presence: !!lang,
        content: lang || 'No language tag found',
    };
}

app.listen(PORT, () => {
    console.log(`SEO Analyzer API is running at http://localhost:${PORT}`);
});

module.exports = { analyzePage };
// Real-time Monitoring Endpoint
app.get('/monitor', async (req, res) => {
    const { url, interval } = req.body;

    if (!url || !interval) {
        return res.status(400).json({ error: 'URL and interval are required' });
    }

    // Start monitoring
    setInterval(async () => {
        try {
            const seoData = await analyzePage(url);
            console.log(`Real-time analysis for ${url}:`, seoData);
            // Optionally store or notify the user with the seoData
        } catch (error) {
            console.error(`Error during monitoring for ${url}:`, error);
        }
    }, interval * 1000); // Convert seconds to milliseconds

    res.json({ message: `Monitoring started for ${url} every ${interval} seconds` });
});

// Webhook Integration (for external triggers)
app.get('/webhook', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const seoData = await analyzePage(url);
        // Handle the SEO data (e.g., store it, send a notification, etc.)
        res.json(seoData);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching or analyzing the page' });
    }
});

// Enhanced API Response Format
function formatSeoResponse(seoData) {
    return {
        success: true,
        data: seoData,
        timestamp: new Date().toISOString(),
    };
}

app.get('/analyze', async (req, res) => {
    const { url } = req.body;

    if (!url) {
        return res.status(400).json({ error: 'URL is required' });
    }

    try {
        const seoData = await analyzePage(url);
        res.json(formatSeoResponse(seoData));
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Error fetching or analyzing the page' });
    }
});