import { engineClient } from "../lib/clients/engine.js";
import {
  CreateEngineCommand,
  DescribeEngineCommand,
  waitUntilEngineCreateComplete,
} from "@stedi/sdk-client-engines";
import { maxWaitTime } from "../setup/contants.js";
import {
  CreateBucketCommand,
  waitUntilBucketCreateComplete,
} from "@stedi/sdk-client-buckets";
import { bucketsClient } from "../lib/clients/buckets.js";
import { randomBytes } from "crypto";

const engine = engineClient();
const buckets = bucketsClient();

export const ensureEngineIsRunning = async () => {
  const engineName = "default";
  try {
    await engine.send(new DescribeEngineCommand({ engineName }));
  } catch (error) {
    console.log(error);
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "ResourceNotFoundException"
    ) {
      const bucketName = `${engineName}-engine-ingestion-${randomBytes(
        6
      ).toString("hex")}`;

      await buckets.send(
        new CreateBucketCommand({
          bucketName,
        })
      );
      await waitUntilBucketCreateComplete(
        {
          client: buckets,
          maxWaitTime: 450,
        },
        {
          bucketName,
        }
      );

      await engine.send(
        new CreateEngineCommand({
          engineName,
          inboxEdiBucketName: bucketName,
        })
      );

      await waitUntilEngineCreateComplete(
        { client: engine, maxWaitTime },
        { engineName }
      );
    }
  }
};
