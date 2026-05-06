import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createLocalSearchIntent, normalizeAgentIntent, SEARCH_INTENT_SCHEMA } from './src/searchIntent.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 16000) {
        reject(new Error('Request body is too large'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    request.on('error', reject);
  });
}

function sendJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;
  const textParts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') textParts.push(content.text);
    }
  }
  return textParts.join('\n');
}

async function callOpenAISearchAgent({ apiKey, model, query, language, now, context }) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 500,
      input: [
        {
          role: 'system',
          content:
            'You are a campus map search parser for XJTLU Taicang campus. Convert the user query into strict filters only. Do not invent events, times, or places. If uncertain, leave structured arrays empty and put useful remaining words in keywords.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            query,
            language,
            now,
            allowedEventTypes: context.eventTypes,
            allowedStudentLenses: context.studentLenses,
            knownBuildings: context.buildings,
            examples: [
              {
                input: 'AB楼二楼今天晚上AI讲座',
                output: {
                  timeFilter: 'laterToday',
                  typeIds: ['academic', 'forum'],
                  lensIds: ['ai-education'],
                  buildingIds: ['AB'],
                  floor: '2F',
                  keywords: ['ai'],
                },
              },
              {
                input: 'M1018 明天 teaching',
                output: {
                  timeFilter: 'tomorrow',
                  typeIds: ['academic'],
                  lensIds: ['ai-education', 'research'],
                  buildingIds: ['M'],
                  room: 'M1018',
                  keywords: ['teaching'],
                },
              },
            ],
          }),
        },
      ],
      text: {
        format: {
          type: 'json_schema',
          name: 'campus_search_intent',
          strict: true,
          schema: SEARCH_INTENT_SCHEMA,
        },
      },
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI API ${response.status}: ${rawText.slice(0, 240)}`);
  }
  const payload = JSON.parse(rawText);
  const outputText = extractOutputText(payload);
  return normalizeAgentIntent(query, JSON.parse(outputText));
}

function createLocalAskAnswer(question, context = {}) {
  const events = Array.isArray(context.visibleEvents) ? context.visibleEvents : [];
  const places = Array.isArray(context.places) ? context.places : [];
  const personalEvents = Array.isArray(context.personalSpace?.openEvents) ? context.personalSpace.openEvents : [];
  const selectedEvent = context.selectedEvent;
  const selectedPlace = context.selectedPlace;
  const normalized = String(question || '').toLowerCase();

  if (/personal|private|mine|my|remind|check.?in|个人|私人|提醒|打卡|反馈/.test(normalized)) {
    const name = context.personalSpace?.name || 'your Personal Space';
    return personalEvents.length
      ? `${name} has ${personalEvents.length} open personal event${personalEvents.length === 1 ? '' : 's'}. Next items include ${personalEvents
          .slice(0, 3)
          .map((event) => `${event.title} (${event.due})`)
          .join('; ')}. SMART Agent can help with private reminders and check-ins, but cannot publish public/Admin events.`
      : `${name} is ready for private reminders, check-ins, and personal events. SMART Agent cannot publish or edit public/Admin events.`;
  }

  if (/where|route|navigate|how to get|路线|怎么去|在哪/.test(normalized) && selectedPlace) {
    return `${selectedPlace.label}: ${selectedPlace.route || ''} ${selectedPlace.guidance || ''}`.trim();
  }

  if (selectedEvent && /this|selected|current|这个|当前/.test(normalized)) {
    return `${selectedEvent.title} is at ${selectedEvent.location}, ${selectedEvent.time}. ${selectedEvent.summary || ''}`.trim();
  }

  if (events.length > 0) {
    return `From the current map filters, I can see ${events.length} event${events.length === 1 ? '' : 's'}. A good next one to check is ${
      events[0].title
    } at ${events[0].location}, ${events[0].time}.`;
  }

  if (places.length > 0) {
    return `I can answer from the current campus map. Visible places include ${places
      .slice(0, 3)
      .map((place) => place.label)
      .join(', ')}.`;
  }

  return 'I can answer questions about the current campus map, public events, routes, and Personal Space. I do not see enough matching map context for that question yet.';
}

async function callOpenAIAskAgent({ apiKey, model, question, language, now, context }) {
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 850,
      input: [
        {
          role: 'system',
          content:
            'You are SMART Agent inside TC Campus Events Map for XJTLU Taicang campus. Answer freely but only from the provided map context when discussing current events, places, routes, and Personal Space. Be concise, practical, and student-facing. You may suggest private Personal Space reminders or check-ins, but you must never create, edit, publish, or delete public/Admin events. If the answer is uncertain or not in context, say what is missing instead of inventing facts.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            language,
            now,
            context,
          }),
        },
      ],
    }),
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`OpenAI API ${response.status}: ${rawText.slice(0, 240)}`);
  }
  const payload = JSON.parse(rawText);
  return extractOutputText(payload).trim();
}

function agentSearchPlugin(env) {
  const apiKey = env.OPENAI_API_KEY || process.env.OPENAI_API_KEY;
  const model = env.OPENAI_AGENT_SEARCH_MODEL || process.env.OPENAI_AGENT_SEARCH_MODEL || 'gpt-5-mini';
  const askModel = env.OPENAI_AGENT_ASK_MODEL || process.env.OPENAI_AGENT_ASK_MODEL || model;

  return {
    name: 'tc-campus-agent-search-api',
    configureServer(server) {
      server.middlewares.use('/api/agent-search', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'Method not allowed' });
          return;
        }

        let query = '';
        try {
          const body = await readJsonBody(request);
          query = String(body.query || '').slice(0, 300);
          const localIntent = createLocalSearchIntent(query);
          if (!query.trim()) {
            sendJson(response, 200, { ok: true, source: 'local', intent: localIntent });
            return;
          }

          if (!apiKey) {
            sendJson(response, 200, {
              ok: true,
              source: 'local',
              reason: 'OPENAI_API_KEY is not configured',
              intent: localIntent,
            });
            return;
          }

          const agentIntent = await callOpenAISearchAgent({
            apiKey,
            model,
            query,
            language: body.language || 'en',
            now: body.now || new Date().toISOString(),
            context: body.context || {},
          });
          sendJson(response, 200, { ok: true, source: 'openai', model, intent: agentIntent });
        } catch (error) {
          sendJson(response, 200, {
            ok: false,
            source: 'local',
            error: error instanceof Error ? error.message : 'Agent search failed',
            intent: createLocalSearchIntent(query),
          });
        }
      });

      server.middlewares.use('/api/agent-ask', async (request, response) => {
        if (request.method !== 'POST') {
          sendJson(response, 405, { ok: false, error: 'Method not allowed' });
          return;
        }

        let question = '';
        let context = {};
        try {
          const body = await readJsonBody(request);
          question = String(body.question || '').slice(0, 1000);
          context = body.context && typeof body.context === 'object' ? body.context : {};
          const localAnswer = createLocalAskAnswer(question, context);
          if (!question.trim()) {
            sendJson(response, 200, { ok: true, source: 'local', answer: 'Ask a question first.' });
            return;
          }

          if (!apiKey) {
            sendJson(response, 200, {
              ok: true,
              source: 'local',
              reason: 'OPENAI_API_KEY is not configured',
              answer: localAnswer,
            });
            return;
          }

          const answer = await callOpenAIAskAgent({
            apiKey,
            model: askModel,
            question,
            language: body.language || 'en',
            now: body.now || new Date().toISOString(),
            context,
          });
          sendJson(response, 200, { ok: true, source: 'openai', model: askModel, answer });
        } catch (error) {
          sendJson(response, 200, {
            ok: false,
            source: 'local',
            error: error instanceof Error ? error.message : 'SMART Agent ask failed',
            answer: createLocalAskAnswer(question, context),
          });
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    base: env.VITE_BASE_PATH || '/',
    plugins: [react(), agentSearchPlugin(env)],
  };
});
