import "dotenv/config"; // Импортирует переменные окружения из .env файла
import TelegramBot from "node-telegram-bot-api"; // Импортирует библиотеку для работы с Telegram Bot API
import Parser from "rss-parser"; // Импортирует библиотеку для парсинга RSS фидов
import { JSONFilePreset } from "lowdb/node"; // Импортирует lowdb для работы с JSON как с базой данных
import translate from "translate";

//import runKeepAliveServer from "./keep_alive.js"; // Импортируем функцию для запуска сервера
//// Запускаем сервер
//runKeepAliveServer();

// Устанавливает значение по умолчанию для базы данных
const defaultData = { links: [] };

// Загружает базу данных из файла db.json или создаёт новый файл с defaultData
const db = await JSONFilePreset("db.json", defaultData);

// Создает новый экземпляр RSS парсера
const parser = new Parser();

// Формирует URL для запроса к Upwork, используя переменные окружения
const formUpworkURL = () => {
  return `${process.env.UPWORK_URL}?` + `client_hires=1-9%2C10-&` + `paging=NaN-undefined&` + `payment_verified=1&` + `proposals=0-4%2C5-9%2C10-14&` + `q=${process.env.UPWORK_QUERY}&` + `sort=recency&` + `t=1&` + `api_params=1&` + `securityToken=${process.env.UPWORK_SECURITY_TOKEN}&` + `userUid=${process.env.UPWORK_USER_UID}&` + `orgUid=${process.env.UPWORK_ORG_UID}`;
};

// Создаёт экземпляр бота Telegram и включает режим опроса
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: true });

// Устанавливает команды для бота
const setBotCommands = () => {
  bot.setMyCommands([
    { command: "/start", description: "Hello message" },
    { command: "/clear", description: "Clear the database" },
  ]);
};

// Обработчики команд
const handleStartCommand = () => {
  bot.onText(/\/start/, (msg) => {
    bot.sendMessage(msg.chat.id, "Hello, I'm Upwork RSS Bot");
  });
};

const handleClearCommand = () => {
  bot.onText(/\/clear/, () => {
    db.data.links = [];
    db.write();
  });
};

// Функция обработки содержимого элемента "content"
const parseContent = (content) => {
  return content.replaceAll("<br />", "\n").replaceAll("&bull;", "•").replaceAll("&quot;", '"').replaceAll("&nbsp;", " ").replace(/<b>/g, "").replace(/<\/b>/g, "");
};

// Функция для формирования и отправки сообщения в Telegram
const formatAndSendMessage = async (item) => {
  let content = parseContent(item.content);

  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  let description = "";
  let budget, postedOn, country, skills, applyLink;
  let skillsFound = false;

  lines.forEach((line) => {
    if (line.startsWith("Budget") || line.startsWith("Hourly Range")) {
      budget = `💰 <b>${line.startsWith("Budget") ? "Бюджет" : "Часовая ставка"}:</b>${line.split(":")[1]}`;
    } else if (line.startsWith("Posted On")) {
      const dateStr = line.substring("Posted On:".length).trim();
      const date = new Date(dateStr);
      const formattedDate = date
        .toLocaleString("ru-RU", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZone: "UTC",
          timeZoneName: "short",
        })
        .replace(",", "");
      postedOn = `📅 <b>Опубликовано:</b> ${formattedDate}`;
    } else if (line.startsWith("Country")) {
      country = `🌍 <b>Страна:</b>${line.split(":")[1]}`;
    } else if (line.includes("click to apply")) {
      applyLink = `🔗 <a href="${item.link}">Нажмите, чтобы подать заявку</a>`;
    } else if (line.startsWith("Skills") && !skillsFound) {
      skills = `🛠 <b>Навыки:</b> ${line.replace("Skills:", "").replace(/ {2,}/g, " ").trim()}`;
      skillsFound = true;
    } else if (!line.startsWith("Category") && !line.startsWith("Skills") && !line.startsWith("Country") && !line.startsWith("Budget") && !line.startsWith("Hourly Range") && !line.startsWith("Posted On")) {
      description += `${line} `;
    }
  });

  if (!applyLink) {
    applyLink = `🔗 <a href="${item.link}">Нажмите, чтобы подать заявку</a>`;
  }

  description = description.trim().replace(/\n{2,}/g, "\n\n");

  const titleAndDescription = `<b>${item.title.replace(" - Upwork", "")}</b>\n\n${description}`;
  const additionalParams = `${budget || ""}\n${postedOn || ""}\n${skills || ""}\n${country || ""}\n\n${applyLink || ""}`;

  const translated = await translate(titleAndDescription, "ru");

  const finalMessage = `${translated}\n\n${additionalParams}`;

  bot.sendMessage(process.env.TELEGRAM_CHAT_ID, finalMessage, { parse_mode: "HTML" });
};

// Функция для проверки новых ссылок в RSS фиде
const checkForNewLinks = async () => {
  try {
    const feed = await parser.parseURL(formUpworkURL());
    feed.items.forEach(async (item) => {
      if (db.data.links.includes(item.link)) return;

      console.log("Written:", item.link);
      db.data.links.push(item.link);
      await formatAndSendMessage(item);
    });

    db.write();
  } catch (error) {
    console.log("Error:", error);
  }
};

// Инициализация бота и установка интервала
const initBot = () => {
  setBotCommands();
  handleStartCommand();
  handleClearCommand();
  checkForNewLinks();
  setInterval(() => checkForNewLinks(), 30000);
};

// Запуск инициализации бота
console.log("Бот запущен");
initBot();
