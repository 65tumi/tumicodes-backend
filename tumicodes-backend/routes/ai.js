const express = require('express');
const https = require('https');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

const AI_API_URL = 'https://ai.ultraxas.com/v1/chat';

function callExternalAI(prompt) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify({ prompt });
        const url = new URL(AI_API_URL);

        const request = https.request(
            {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    'x-api-key': process.env.AI_API_KEY
                }
            },
            (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += chunk;
                });

                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);

                        if (res.statusCode < 200 || res.statusCode >= 300) {
                            return reject(
                                new Error(
                                    parsed.error ||
                                    parsed.message ||
                                    `AI provider error: ${res.statusCode}`
                                )
                            );
                        }

                        resolve(parsed);
                    } catch (err) {
                        reject(new Error('Invalid AI provider response'));
                    }
                });
            }
        );

        request.on('error', reject);

        request.write(body);
        request.end();
    });
}

router.post('/', authenticateToken, async (req, res) => {
    if (!process.env.AI_API_KEY) {
        return res.status(500).json({
            error: 'AI API key is not configured',
            code: 'AI_API_KEY_MISSING'
        });
    }

    const { prompt, messages } = req.body;

    if (!prompt && !Array.isArray(messages)) {
        return res.status(400).json({
            error: 'Prompt is required',
            code: 'MISSING_PROMPT'
        });
    }

    let finalPrompt = prompt;

    // Convert chat messages into a single prompt if needed
    if (!finalPrompt && Array.isArray(messages)) {
        finalPrompt = messages
            .map(msg => `${msg.role}: ${msg.content}`)
            .join('\n');
    }

    try {
        const apiResponse = await callExternalAI(finalPrompt);

        const reply =
            apiResponse.response ||
            apiResponse.reply ||
            apiResponse.message ||
            '';

        if (!reply) {
            console.error('Unexpected AI response:', apiResponse);

            return res.status(502).json({
                error: 'AI provider returned an empty response',
                code: 'AI_EMPTY_RESPONSE',
                raw: apiResponse
            });
        }

        res.json({
            success: true,
            reply
        });

    } catch (error) {
        console.error('AI route error:', error);

        res.status(502).json({
            error: error.message,
            code: 'AI_PROVIDER_ERROR'
        });
    }
});

module.exports = router;
