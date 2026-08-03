import { db } from '../db/schema';

export async function exportAllData() {
  const data = {
    version: 1,
    exportedAt: Date.now(),
    journals: await db.journals.toArray(),
    notes: await db.notes.toArray(),
    cards: await db.cards.toArray(),
    graphNodes: await db.graphNodes.toArray(),
    graphEdges: await db.graphEdges.toArray(),
    settings: await db.settings.toArray(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'study-journal-' + new Date().toISOString().split('T')[0] + '.json';
  a.click();
  URL.revokeObjectURL(url);
}

export async function importData(file: File) {
  const text = await file.text();
  const data = JSON.parse(text);
  await db.transaction('rw',
    db.journals, db.notes, db.cards, db.graphNodes, db.graphEdges,
    async () => {
      if (data.journals) await db.journals.bulkPut(data.journals);
      if (data.notes) await db.notes.bulkPut(data.notes);
      if (data.cards) await db.cards.bulkPut(data.cards);
      if (data.graphNodes) await db.graphNodes.bulkPut(data.graphNodes);
      if (data.graphEdges) await db.graphEdges.bulkPut(data.graphEdges);
    }
  );
}
