import { config } from 'dotenv'
import { readFile } from 'fs/promises'
import path from 'path'
import OpenAI from 'openai'

const Papa = require('papaparse') as any

config()

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'mapCsvHeaders',
      description:
        'Ordnet CSV-Header den internen Feldern zu. Nicht erkannte Felder sind null. Fehlerhinweise stehen im "error"-Feld.',
      parameters: {
        type: 'object',
        properties: {
          email: {
            type: ['string', 'null'],
            description: 'Header mit der E-Mail-Adresse, oder null wenn nicht erkannt',
          },
          firstName: {
            type: ['string', 'null'],
            description: 'Header mit dem Vornamen, oder null wenn nicht erkannt',
          },
          lastName: {
            type: ['string', 'null'],
            description: 'Header mit dem Nachnamen, oder null wenn nicht erkannt',
          },
          error: {
            type: 'string',
            description:
              'Fehlertext, wenn Felder nicht zugeordnet werden konnten (optional, aber empfohlen bei null-Werten)',
          },
        },
        required: ['email', 'firstName', 'lastName'],
      },
    },
  },
]

async function main() {
  const csvPath = path.join(process.cwd(), 'public', 'test.csv')
  const csvContent = await readFile(csvPath, 'utf-8')

  const firstLine = csvContent.split('\n')[0]
  const headers = firstLine.split(',').map(h => h.trim())

  if (!headers || headers.length === 0) {
    console.error('Keine Header gefunden')
    return
  }

  console.log('Gefundene Header:', headers)

  const userMessage = {
    role: 'user' as const,
    content: `Hier sind die Spaltenüberschriften einer CSV-Datei: ${JSON.stringify(headers)}.

Bitte ordne sie den internen Feldern "email", "firstName" und "lastName" zu.

- Gib für jedes Feld den Original-Header zurück (z.B. "E-Mail-Adresse").
- Falls du ein Feld nicht zuordnen kannst, gib für dieses Feld den Wert null zurück.
- Wenn mindestens eines dieser Felder null ist, MUSST du zusätzlich ein Feld "error" zurückgeben, das beschreibt, welche Felder nicht zugeordnet wurden und warum.
- Hinweis: Das Wort "Name" bedeutet im Deutschen in der Regel "Nachname" und sollte daher dem internen Feld "lastName" zugeordnet werden.`,
  }

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [userMessage],
      tools,
      tool_choice: { type: 'function', function: { name: 'mapCsvHeaders' } },
    })

    const toolCall = response.choices[0].message.tool_calls?.[0]
    const result = JSON.parse(toolCall?.function.arguments ?? '{}')

    console.log('Header-Mapping:')
    console.log(result)

    // Fallback: Wenn kein Fehler zurückgegeben wurde, aber null-Werte enthalten sind
    if (!result.error) {
      const missing = ['email', 'firstName', 'lastName'].filter((key) => result[key] === null)
      if (missing.length > 0) {
        result.error = `Folgende Felder konnten nicht zugeordnet werden: ${missing.join(', ')}`
        console.warn('Fehlerhinweis (automatisch ergänzt):', result.error)
      }
    } else {
      console.warn('Fehlerhinweis:', result.error)
    }
  } catch (err) {
    console.error('Fehler beim OpenAI-Aufruf:', err)
  }
}

main()
