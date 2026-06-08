/**
 * topics.json の除外判定
 */
export type Topic = {
  id: string;
  label: string;
  startSec: number;
  endSec: number;
};

const EXCLUDED_TOPIC_IDS = ['intro', 'outro'];

export function filterActiveTopics(topics: Topic[]): Topic[] {
  return topics.filter(t => !EXCLUDED_TOPIC_IDS.includes(t.id));
}
