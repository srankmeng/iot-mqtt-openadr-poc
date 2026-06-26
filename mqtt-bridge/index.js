const mqtt = require("mqtt");
const { Kafka } = require("kafkajs");

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://localhost:1883";
const MQTT_TOPICS = (process.env.MQTT_TOPICS || "devices/#").split(",");
const KAFKA_BROKERS = (process.env.KAFKA_BROKERS || "localhost:9092").split(",");
const TOPIC_TELEMETRY = process.env.KAFKA_TOPIC_TELEMETRY || "iot.telemetry";
const TOPIC_EVENTS = process.env.KAFKA_TOPIC_EVENTS || "iot.events";

// ── Kafka ──────────────────────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: "mqtt-bridge",
  brokers: KAFKA_BROKERS,
  retry: { retries: 10, initialRetryTime: 3000 },
});

const producer = kafka.producer();

async function connectKafka() {
  await producer.connect();
  console.log("[Kafka] Producer connected");
}

// ── Route MQTT topic → Kafka topic ─────────────────────────────────────────
// devices/<deviceId>/telemetry  → iot.telemetry
// devices/<deviceId>/events     → iot.events
function resolveKafkaTopic(mqttTopic) {
  if (mqttTopic.endsWith("/telemetry")) return TOPIC_TELEMETRY;
  if (mqttTopic.endsWith("/events")) return TOPIC_EVENTS;
  return null; // unrecognised path segment — do not forward
}

function extractDeviceId(mqttTopic) {
  // Expected format: devices/<deviceId>/...
  const parts = mqttTopic.split("/");
  return parts[1] || "unknown";
}

// ── MQTT ───────────────────────────────────────────────────────────────────
async function startBridge() {
  await connectKafka();

  const client = mqtt.connect(MQTT_BROKER_URL, {
    clientId: `mqtt-bridge-${Date.now()}`,
    reconnectPeriod: 3000,
  });

  client.on("connect", () => {
    console.log(`[MQTT] Connected to ${MQTT_BROKER_URL}`);
    MQTT_TOPICS.forEach((topic) => {
      client.subscribe(topic.trim(), (err) => {
        if (err) console.error(`[MQTT] Subscribe error on ${topic}:`, err.message);
        else console.log(`[MQTT] Subscribed to ${topic}`);
      });
    });
  });

  client.on("message", async (topic, payload) => {
    try {
      const kafkaTopic = resolveKafkaTopic(topic);
      if (!kafkaTopic) {
        console.log(`[Bridge] Ignored unrecognised topic: ${topic}`);
        return;
      }
      const deviceId = extractDeviceId(topic);

      let data;
      try {
        data = JSON.parse(payload.toString());
      } catch {
        data = { raw: payload.toString() };
      }

      const message = {
        deviceId,
        mqttTopic: topic,
        timestamp: new Date().toISOString(),
        payload: data,
      };

      await producer.send({
        topic: kafkaTopic,
        messages: [
          {
            key: deviceId,
            value: JSON.stringify(message),
          },
        ],
      });

      console.log(`[Bridge] ${topic} → kafka:${kafkaTopic} (device: ${deviceId})`);
    } catch (err) {
      console.error("[Bridge] Error forwarding message:", err.message);
    }
  });

  client.on("error", (err) => console.error("[MQTT] Error:", err.message));
  client.on("reconnect", () => console.log("[MQTT] Reconnecting..."));
  client.on("offline", () => console.warn("[MQTT] Offline"));
}

startBridge().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
