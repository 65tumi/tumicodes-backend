const express = require('express');
const https = require('https');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');

const AI_API_URL = 'https://ai.ultraxas.com/v1/chat';

function callExternalAI(payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const url = new URL(AI_API_URL);

        const request = https.request(
            {
                hostname: url.hostname,
                path: url.pathname + url.search,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body),
                    Authorization: `Bearer ${process.env.AI_API_KEY}`
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
                            return reject(new Error(parsed?.error?.message || `AI provider error: ${res.statusCode}`));
                        }
                        resolve(parsed);
                    } catch (error) {
                        reject(new Error('Invalid AI provider response'));
                    }
                });
            }
        );

        request.on('error', (error) => {
            reject(error);
        });

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

    const { prompt, messages, model } = req.body;
    if (!prompt && !Array.isArray(messages)) {
        return res.status(400).json({
            error: 'Missing prompt or messages',
            code: 'MISSING_AI_INPUT'
        });
    }

    const systemMessages = [
        {
            role: 'system',
            content: 'You are a helpful AI tutor for TumiCodes learners. Answer clearly and support the user with code explanations, debugging help, and learning advice.'
        }
    ];

    const conversation = Array.isArray(messages)
        ? messages
        : [...systemMessages, { role: 'user', content: prompt }];

    const payload = {
        model: model || 'gpt-4.1',
        messages: conversation,
        temperature: 0.7,
        max_tokens: 700
    };

    try {
        const apiResponse = await callExternalAI(payload);
        const choice = Array.isArray(apiResponse.choices) ? apiResponse.choices[0] : null;
        const reply = choice?.message?.content || choice?.text || '';

        if (!reply) {
            console.error('AI route received empty response', apiResponse);
            return res.status(502).json({
                error: 'AI provider returned no reply',
                code: 'AI_EMPTY_REPLY'
            });
        }

        res.json({ reply, raw: apiResponse });
    } catch (error) {
        console.error('AI route error:', error);
        res.status(502).json({
            error: error.message || 'AI provider request failed',
            code: 'AI_PROVIDER_ERROR'
        });
    }
});

module.exports = router;
