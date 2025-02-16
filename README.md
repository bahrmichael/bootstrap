# Stedi EDI Bootstrap

> **Note**
> This version of bootstrap utilizes [Stedi Core](https://www.stedi.com/docs/core). The previous version of bootstrap
> can be found in the [legacy](https://github.com/stedi-demos/bootstrap/tree/legacy) branch.

This repository contains an end-to-end configuration for building an X12 EDI system using Stedi products. This
implementation demonstrates one way to build an integration for common EDI read and write use cases. Your solution
may differ depending on your systems and requirements.

We strongly recommend reviewing the documentation for [Stedi Core](https://www.stedi.com/docs/core) before deploying the
bootstrap implementation.

- [Hands-on support](#hands-on-support)
- [Bootstrap read and write workflow](#bootstrap-read-and-write-workflow)
- [Requirements](#requirements)
- [Deploying bootstrap resources](#deploying-bootstrap-resources)
- [Testing the workflows](#testing-the-workflows)
- [Clean up bootstrap resources](#clean-up-bootstrap-resources)
- [Customizing the workflows](#customizing-the-workflows)
- [Troubleshooting](#troubleshooting)

## Hands-on support

We'd like to help set up and customize the bootstrap repository with you. Working together helps us understand what
Stedi
customers need and helps get your solution into production as quickly as possible. We offer free hands-on support that
includes:

- Help deploying the bootstrap workflows and customizing them for your use cases
- Best practices for designing scalable connections between Stedi and your systems
- EDI experts to answer your questions
- Live troubleshooting over Slack or video call

[Contact us](https://www.stedi.com/contact) to get started.

## Bootstrap read and write workflow

The [Stedi Core module](https://www.stedi.com/docs/core) ingests data and emits events with the results of its
conversion and validation processing. For example, Core emits an event when it receives a new file or successfully
processes a transaction set.

To create a custom end-to-end EDI system on Stedi, you need to automate tasks like adding files from your input buckets
and reacting to the emitted events. For example, you may want to automatically forward translated EDI files to an API,
FTP server, AS2 server, or a [Stedi function](https://www.stedi.com/docs/functions) to run custom code.

Bootstrap contains opinionated Stedi functions that you can customize through configuration. For example, you can
add [Destinations](#destinations) where the bootstrap workflows will send incoming and outgoing data. The following
sections describe these built-in functions.

### Inbound EDI workflow

The `edi-inbound` function listens to Stedi Core `transaction.processed` events, which contain the partnership, document
direction, location of the translated document, and document transaction set ID for a single EDI transaction set. When
it receives an event, it performs the following steps:

1. Read the translated EDI-like JSON data from the [Stedi bucket](https://www.stedi.com/products/buckets) configured to
   receive Core output.
1. Look up configured destinations for the specific partnership and transaction set ID. Refer
   to [Destinations](#destinations) for details.
1. If a destination has a [Stedi Mapping](https://www.stedi.com/products/mappings) configured, apply the mapping
   transformation the JSON.
1. Send the JSON to each destination.
1. Send failures (such as invalid mappings or missing guides)
   to [Execution Error Destinations](#execution-error-destinations).
1. Retry function execution failures 2 more times. These retries can result in destinations receiving multiple messages,
   so you must handle at-least-once message delivery separately. We recommend using payload control numbers and message
   timestamps for deduplication.

### Outbound EDI workflow

The `edi-outbound` function performs the following steps when it receives a payload and a metadata object. The payload
must match the shape of the Guide's JSON Schema for writing EDI. Or, if a mappingId is specified, then the payload is
the input for a mapping which will output valid Guide JSON data.

1. Use the metadata to look up the configuration values required to construct an EDI envelope. The `partnershipId` is
   the only required field.
1. If a [Stedi Mapping](https://www.stedi.com/products/mappings) is specified, apply the mapping transformation to the
   JSON.
1. Call [Stedi EDI Translate](https://www.stedi.com/products/edi-translate) to transform the JSON payload into an EDI
   file.
1. Look up configured destinations for the specific partnership and transaction set ID. Refer
   to [Destinations](#destinations) for details.
1. Send failures to [Execution Error Destinations](#execution-error-destinations).
1. Retry function execution failures 2 or more times. These retries can result in destinations receiving multiple
   messages, so you must handle at-least-once message delivery separately. We recommend using payload control numbers
   and message timestamps for deduplication.

### Processed functional groups workflow

The `edi-acknowledgement` function listens to Stedi Core `functional_group.processed` inbound events, which contain the
partnership, document direction, and envelope data for a single functional group. When it receives an event, the
function performs the following steps:

1. If the direction is `RECEIVED`, look up up 997 acknowledgment configuration for the specific partnership and
   transaction set Ids in the functional group. Refer to [Acknowledgments](#acknowledgment-configuration) for details.
1. If transaction sets are in the functional group with 997 acknowledgments configured, generate a 997 EDI-like JSON
   file and send it to the `edi-outbound` function for processing.

### File error workflow

The events-file-error function listens to Stedi Core `file.failed` events, which Stedi emits when there is an error
processing a file. When it receives an event, the function performs the following steps:

1. Look up the configured file error destinations. Refer to [File Error Destinations](#file-error-destinations) for
   details.
1. Forward the errors to each destination.

## Requirements

1. Install [Node.js](https://docs.npmjs.com/downloading-and-installing-node-js-and-npm) _(minimum version: 18)_

1. Clone the bootstrap repository and install the necessary dependencies:

   ```bash
   git clone https://github.com/Stedi-Demos/bootstrap.git
   cd bootstrap
   npm ci
   ```

1. Create a [Stedi account](https://www.stedi.com/auth/sign-up) and enable Core. Bootstrap does not overwrite existing
   Core settings or data.

1. Rename the bootstrap's `.env.example` file to `.env` and update the following environment variables:

    - `STEDI_API_KEY`: A Stedi API key is required for authentication. You
      can [generate an API key](https://www.stedi.com/app/settings/api-keys) in your Stedi account.
    - `DESTINATION_WEBHOOK_URL`: Go to [webhook.site](https://webhook.site/) and copy the unique URL. The bootstrap
      workflow sends output to this webhook.

   Example `.env` file

   ```
   STEDI_API_KEY=<YOUR_STEDI_API_KEY>
   DESTINATION_WEBHOOK_URL=<YOUR_WEBHOOK_URL>
   ```

## Deploying bootstrap resources

Run the following command in the bootstrap directory:

```bash
npm run bootstrap
```

## Testing the workflows

### Inbound EDI

Core automatically processes new files in the designated bucket for incoming data. When Core processes a file, it emits
events that automatically invoke the `edi-inbound` function for each processed transaction set.

1. Go to the [Buckets UI](https://www.stedi.com/app/buckets) and navigate to the `inbound` directory for your trading
   partner: `<SFTP_BUCKET_NAME>/trading_partners/ANOTHERMERCH/inbound`

1. Upload the [input X12 5010 855 EDI](src/resources/X12/5010/855/inbound.edi) document to this directory.

1. Look for the output of the function wherever you created your test webhook. The function sends the translated JSON
   payload to the endpoint you configured.
      <details><summary>Example webhook output (click to expand):</summary>

   ```json
   {
     "envelope": {
       "interchangeHeader": {
         "authorizationInformationQualifier": "00",
         "authorizationInformation": "          ",
         "securityQualifier": "00",
         "securityInformation": "          ",
         "senderQualifier": "14",
         "senderId": "ANOTHERMERCH   ",
         "receiverQualifier": "ZZ",
         "receiverId": "THISISME       ",
         "date": "2022-09-14",
         "time": "20:22",
         "repetitionSeparator": "U",
         "controlVersionNumber": "00501",
         "controlNumber": "000001746",
         "acknowledgementRequestedCode": "0",
         "usageIndicatorCode": "T",
         "componentSeparator": ">"
       },
       "groupHeader": {
         "functionalIdentifierCode": "PR",
         "applicationSenderCode": "ANOTAPPID",
         "applicationReceiverCode": "MYAPPID",
         "date": "2022-09-14",
         "time": "20:22:22",
         "controlNumber": "000001746",
         "agencyCode": "X",
         "release": "005010"
       },
       "groupTrailer": {
         "numberOfTransactions": "1",
         "controlNumber": "000001746"
       },
       "interchangeTrailer": {
         "numberOfFunctionalGroups": "1",
         "controlNumber": "000001746"
       }
     },
     "transactionSets": [
       {
         "heading": {
           "transaction_set_header_ST": {
             "transaction_set_identifier_code_01": "855",
             "transaction_set_control_number_02": 1
           },
           "beginning_segment_for_purchase_order_acknowledgment_BAK": {
             "transaction_set_purpose_code_01": "00",
             "acknowledgment_type_02": "AD",
             "purchase_order_number_03": "365465413",
             "date_04": "2022-09-14",
             "date_09": "2022-09-13"
           },
           "reference_information_REF": [
             {
               "reference_identification_qualifier_01": "CO",
               "reference_identification_02": "ACME-4567"
             }
           ],
           "party_identification_N1_loop_ship_to": [
             {
               "party_identification_N1": {
                 "entity_identifier_code_01": "ST",
                 "name_02": "Wile E Coyote",
                 "identification_code_qualifier_03": "92",
                 "identification_code_04": "DROPSHIP CUSTOMER"
               },
               "party_location_N3": [
                 {
                   "address_information_01": "111 Canyon Court"
                 }
               ],
               "geographic_location_N4": {
                 "city_name_01": "Phoenix",
                 "state_or_province_code_02": "AZ",
                 "postal_code_03": "85001",
                 "country_code_04": "US"
               }
             }
           ],
           "party_identification_N1_loop_selling_party": [
             {
               "party_identification_N1": {
                 "entity_identifier_code_01": "SE",
                 "name_02": "Marvin Acme",
                 "identification_code_qualifier_03": "92",
                 "identification_code_04": "DROPSHIP CUSTOMER"
               },
               "party_location_N3": [
                 {
                   "address_information_01": "123 Main Street"
                 }
               ],
               "geographic_location_N4": {
                 "city_name_01": "Fairfield",
                 "state_or_province_code_02": "NJ",
                 "postal_code_03": "07004",
                 "country_code_04": "US"
               }
             }
           ]
         },
         "detail": {
           "baseline_item_data_PO1_loop": [
             {
               "baseline_item_data_PO1": {
                 "assigned_identification_01": "item-1",
                 "quantity_02": 8,
                 "unit_or_basis_for_measurement_code_03": "EA",
                 "unit_price_04": 400,
                 "product_service_id_qualifier_06": "VC",
                 "product_service_id_07": "VND1234567",
                 "product_service_id_qualifier_08": "SK",
                 "product_service_id_09": "ACM/8900-400"
               },
               "product_item_description_PID_loop": [
                 {
                   "product_item_description_PID": {
                     "item_description_type_01": "F",
                     "description_05": "400 pound anvil"
                   }
                 }
               ],
               "line_item_acknowledgment_ACK_loop": [
                 {
                   "line_item_acknowledgment_ACK": {
                     "line_item_status_code_01": "IA",
                     "quantity_02": 8,
                     "unit_or_basis_for_measurement_code_03": "EA"
                   }
                 }
               ]
             },
             {
               "baseline_item_data_PO1": {
                 "assigned_identification_01": "item-2",
                 "quantity_02": 4,
                 "unit_or_basis_for_measurement_code_03": "EA",
                 "unit_price_04": 125,
                 "product_service_id_qualifier_06": "VC",
                 "product_service_id_07": "VND000111222",
                 "product_service_id_qualifier_08": "SK",
                 "product_service_id_09": "ACM/1100-001"
               },
               "product_item_description_PID_loop": [
                 {
                   "product_item_description_PID": {
                     "item_description_type_01": "F",
                     "description_05": "Detonator"
                   }
                 }
               ],
               "line_item_acknowledgment_ACK_loop": [
                 {
                   "line_item_acknowledgment_ACK": {
                     "line_item_status_code_01": "IA",
                     "quantity_02": 4,
                     "unit_or_basis_for_measurement_code_03": "EA"
                   }
                 }
               ]
             }
           ]
         },
         "summary": {
           "transaction_totals_CTT_loop": [
             {
               "transaction_totals_CTT": {
                 "number_of_line_items_01": 2
               }
             }
           ],
           "transaction_set_trailer_SE": {
             "number_of_included_segments_01": 17,
             "transaction_set_control_number_02": "0001"
           }
         }
       }
     ],
     "delimiters": {
       "element": "*",
       "composite": ">",
       "repetition": "U",
       "segment": "~"
     }
   }
   ```

      </details>

### Outbound EDI

You can invoke the `edi-outbound` function through the UI for testing.

1. Navigate to the `edi-outbound` function in
   the (Functions UI)[https://www.stedi.com/app/functions/edi-outbound/edit](https://www.stedi.com/app/functions).

1. Click the `Edit execution payload` link, and paste the contents
   of [src/resources/X12/5010/850/outbound.json](src/resources/X12/5010/850/outbound.json) into the payload modal, and
   click save.

1. Click **Execute** and choose the **Synchronous** option. If successful the `Output` should look similar to the
   following:

   <details><summary>Example function output (click to expand):</summary>

   ```json
   {
     "statusCode": 200,
     "deliveryResults": [
       {
         "type": "bucket",
         "payload": {
           "bucketName": "<STEDI_ACCOUNT_ID>-sftp",
           "key": "trading_partners/ANOTHERMERCH/outbound/1-850.edi",
           "body": "ISA*00*          *00*          *ZZ*THISISME       *14*ANOTHERMERCH   *230113*2027*U*00501*000000005*0*T*>~GS*PO*MYAPPID*ANOTAPPID*20230113*202727*000000005*X*005010~ST*850*0001~BEG*00*DS*365465413**20220830~REF*CO*ACME-4567~REF*ZZ*Thank you for your business~PER*OC*Marvin Acme*TE*973-555-1212*EM*marvin@acme.com~TD5****ZZ*FHD~N1*ST*Wile E Coyote*92*123~N3*111 Canyon Court~N4*Phoenix*AZ*85001*US~PO1*item-1*0008*EA*400**VC*VND1234567*SK*ACM/8900-400~PID*F****400 pound anvil~PO1*item-2*0004*EA*125**VC*VND000111222*SK*ACM/1100-001~PID*F****Detonator~CTT*2~AMT*TT*3700~SE*16*0001~GE*1*000000005~IEA*1*000000005~"
         }
       }
     ]
   }
   ```

   </details>

1. You can view the file using the [Buckets UI](https://www.stedi.com/app/buckets). The output of the
   function includes the `bucketName` and `key` (path within the bucket) of where the function saved the generated EDI.

## Customizing the workflows

The bootstrap workflow uses sample [Partners](https://stedi.com/app/core/profiles),
a [Partnership](https://stedi.com/app/core/partnerships) associating the two partners, and configuration values
for destinations configured in Stash to set up and test the read and write EDI workflows. You can customize the
bootstrap workflow by doing one or all of the following:

- [Edit a partner profile](https://stedi.com/app/core/profiles)
  to replace the test trading partner with your real trading partners' details and requirements.
- [Customize configuration in Stash](#stash-configuration). Add partnership and transaction set configurations for
  partnerships, set one or more destinations for a given configurations, forward errors to external services or archive
  in buckets, configure mappings, and send 997 acknowledgments.
- Create [Stedi mappings](https://stedi.com/app/mappings). Add a `mappingId` property to a Stash destination
  configuration to transform the inbound payload before sending to a destination. Or, when sending EDI, the `mappingId`
  can transform the event payload into the JSON schema required for translating to EDI.
- [Create SFTP users](https://www.stedi.com/app/sftp)
  for your trading partners, so they can send and retrieve EDI documents from Stedi Buckets.

You may want to use additional Stedi products to further optimize your EDI workflows. We can help you customize the
bootstrap workflow and determine which products and approaches are right for your use
cases. [Contact us](https://www.stedi.com/contact) to set up a meeting with our technical team.

## Poll remote FTP / SFTP servers

You can poll remote FTP and SFTP servers to download files from your
trading partners. Visit
the [External FTP / SFTP poller README](src/functions/ftp/external-poller/README.md) for details.

## Clean up bootstrap resources

To delete all the resources created by the bootstrap, run the following command:

```bash
npm run destroy
```

## Stash configuration

[Stedi Stash](https://www.stedi.com/products/stash) is a key/value store. You can add and edit Stash key-value pairs to
configure destinations for incoming and outgoing documents, destinations for errors, and which transaction sets require
functional acknowledgements.

### Destinations

- [AS2](./src/schemas/destination-as2.json)
- [Bucket](./src/schemas/destination-bucket.json)
- [Function](./src/schemas/destination-function.json)
- [SFTP](./src/schemas/destination-sftp.json)
- [Stash](./src/schemas/destination-stash.json)
- [Webhook](./src/schemas/destination-webhook.json)

#### Transaction set destination

key: `destinations|${partnershipId}|${transactionSetId}`

value: [JSON Schema](./src/schemas/transaction-destinations.json)

## Execution error destinations

key: `destinations|errors|execution`

value: [JSON Schema](./src/schemas/error-destinations.json)

### File error destinations

key: `destinations|errors|execution`

value: [JSON Schema](./src/schemas/error-destinations.json)

### Acknowledgment configuration

key: `functional_acknowledgments|${partnershipId}`

value: [JSON Schema](./src/schemas/acknowledgment.json)
   
## Troubleshooting

```
There was an issue installing the dependencies using your local npm installation, please check your .npmrc and try again.
```

If you created a `.npmrc` in this repository, please remove it.

If you still see this error, you may have a registry override in your npm config. Run `npm config list` and search for `registry` like below. Comment out that line and try again.

```
@stedi:registry = "https://npm.pkg.github.com/" 
```

