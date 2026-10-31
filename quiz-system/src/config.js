import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: Number(process.env.PORT || 3000),
  com7BaseUrl: process.env.COM7_BASE_URL || "http://192.168.4.1",
  questionCsvPath: path.resolve(__dirname, "../../Question/questions.csv")
};
