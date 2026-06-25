const { Client } = require('@notionhq/client');

const notion = new Client({ auth: process.env.NOTION_TOKEN });
const DATABASE_ID = process.env.NOTION_DATABASE_ID;

function calcAlert(endDateStr) {
  if (!endDateStr) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const endDate = new Date(endDateStr);
  endDate.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((endDate - today) / (1000 * 60 * 60 * 24));
  if (diffDays < 0)   return '⚫ 終了済み';
  if (diffDays <= 60)  return '🔴 2ヶ月以内';
  if (diffDays <= 120) return '🟡 2〜4ヶ月';
  return '🟢 4ヶ月以上';
}

async function getAllPages() {
  const pages = [];
  let cursor = undefined;
  while (true) {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    if (!res.has_more) break;
    cursor = res.next_cursor;
  }
  return pages;
}

async function main() {
  console.log(`実行日時: ${new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`);
  const pages = await getAllPages();
  console.log(`取得件数: ${pages.length}件`);
  let updated = 0, skipped = 0, unchanged = 0;

  for (const page of pages) {
    const props = page.properties;
    const endDateStr = props['契約終了日']?.date?.start ?? null;
    const currentAlert = props['更新アラート']?.select?.name ?? null;
    if (!endDateStr) { skipped++; continue; }
    const newAlert = calcAlert(endDateStr);
    if (currentAlert === newAlert) { unchanged++; continue; }
    const name = props['契約名']?.title?.[0]?.plain_text ?? '（名称なし）';
    try {
      await notion.pages.update({
        page_id: page.id,
        properties: { '更新アラート': { select: { name: newAlert } } },
      });
      console.log(`✅ ${name} | ${currentAlert ?? '(未設定)'} → ${newAlert}`);
      updated++;
    } catch (err) {
      console.error(`❌ ${name} | ${err.message}`);
    }
  }
  console.log(`\n完了 — 更新: ${updated}件 / 変更なし: ${unchanged}件 / スキップ: ${skipped}件`);
}

main().catch((err) => { console.error(err); process.exit(1); });
