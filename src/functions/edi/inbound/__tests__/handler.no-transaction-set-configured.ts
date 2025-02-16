import test from "ava";
import nock from "nock";
import {
  mockBucketClient,
  mockExecutionTracking,
  mockPartnersClient,
  mockStashClient,
} from "../../../../lib/testing/testHelpers.js";
import { handler } from "../handler.js";
import { GetValueCommand } from "@stedi/sdk-client-stash";
import { sampleTransactionProcessedEvent } from "../__fixtures__/events.js";
import guideJSON855 from "../__fixtures__/855-guide.json" assert { type: "json" };
import { GetObjectCommand } from "@stedi/sdk-client-buckets";
import { Readable } from "node:stream";
import { PARTNERS_KEYSPACE_NAME } from "../../../../lib/constants.js";
import { destinationExecutionErrorKey } from "../../../../lib/types/Destination.js";
import { sdkStreamMixin } from "@aws-sdk/util-stream-node";
import { ErrorWithContext } from "../../../../lib/errorWithContext.js";

const buckets = mockBucketClient();
const partners = mockPartnersClient();
const stash = mockStashClient();

const partnershipId = "this-is-me_another-merchant";

test.beforeEach(() => {
  nock.disableNetConnect();
  mockExecutionTracking(buckets);
});

test.afterEach.always(() => {
  buckets.reset();
  partners.reset();
  stash.reset();
});

test("throws runtime error when no configuration is found for transaction set", async (t) => {
  // loading incoming EDI file from S3
  buckets.on(GetObjectCommand, {}).resolves({
    body: sdkStreamMixin(
      Readable.from([new TextEncoder().encode(JSON.stringify(guideJSON855))])
    ),
  });

  stash
    .on(GetValueCommand, {
      key: `destinations|${partnershipId}|855`,
    }) // mock destinations lookup
    .rejectsOnce({
      name: "ResourceNotFoundException",
    });

  stash
    // loading destinations
    .on(GetValueCommand, {
      keyspaceName: PARTNERS_KEYSPACE_NAME,
      key: destinationExecutionErrorKey,
    })
    .resolvesOnce({
      value: {
        description: "execution errors",
        destinations: [
          {
            destination: {
              type: "webhook",
              url: "https://example.com/error-webhook",
            },
          },
        ],
      },
    });

  const errorWebhook = nock("https://example.com")
    .post("/error-webhook", (body: any) => {
      return body.error.message === "no transaction set configured";
    })
    .reply(200);

  const response = await handler(sampleTransactionProcessedEvent as any).catch(
    (e) => e
  );

  t.assert(response instanceof ErrorWithContext, "not successful");
  t.assert(errorWebhook.isDone(), "error webhook is called");
});
