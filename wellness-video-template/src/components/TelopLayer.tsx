import { type TelopEntryData } from "../schema";
import { TelopLine } from "./TelopLine";

/**
 * テロップ行を一括レンダリングする。
 * データは VideoMain から props 経由で受け取る（script.json 由来）。
 */
export const TelopLayer: React.FC<{ telops: TelopEntryData[] }> = ({ telops }) => {
  return (
    <>
      {telops.map((entry, i) => (
        <TelopLine key={i} entry={entry} />
      ))}
    </>
  );
};
