import { Suspense } from "react";

const metadataUrl = "http://169.254.169.254";

type InstanceIdentity = {
  instanceId: string;
  instanceType: string;
  region: string;
  availabilityZone: string;
  privateIp: string;
};

type MetadataResult =
  | { available: true; instance: InstanceIdentity }
  | { available: false; message: string };

function isIdentityDocument(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function getInstanceMetadata(): Promise<MetadataResult> {
  try {
    const tokenResponse = await fetch(`${metadataUrl}/latest/api/token`, {
      method: "PUT",
      headers: { "X-aws-ec2-metadata-token-ttl-seconds": "60" },
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });

    if (!tokenResponse.ok) {
      return {
        available: false,
        message: "The EC2 metadata service did not provide an IMDSv2 token.",
      };
    }

    const token = await tokenResponse.text();
    if (!token) {
      return {
        available: false,
        message: "The EC2 metadata service returned an empty IMDSv2 token.",
      };
    }

    const identityResponse = await fetch(
      `${metadataUrl}/latest/dynamic/instance-identity/document`,
      {
        headers: { "X-aws-ec2-metadata-token": token },
        cache: "no-store",
        signal: AbortSignal.timeout(1500),
      },
    );

    if (!identityResponse.ok) {
      return {
        available: false,
        message: "The EC2 instance identity document could not be retrieved.",
      };
    }

    const identity: unknown = await identityResponse.json();
    if (!isIdentityDocument(identity)) {
      return {
        available: false,
        message: "The EC2 metadata service returned an invalid identity document.",
      };
    }

    const { instanceId, instanceType, region, availabilityZone, privateIp } =
      identity;
    if (
      typeof instanceId !== "string" ||
      typeof instanceType !== "string" ||
      typeof region !== "string" ||
      typeof availabilityZone !== "string" ||
      typeof privateIp !== "string"
    ) {
      return {
        available: false,
        message: "The EC2 identity document is missing required instance details.",
      };
    }

    return {
      available: true,
      instance: { instanceId, instanceType, region, availabilityZone, privateIp },
    };
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        available: false,
        message: "The EC2 metadata service returned an invalid identity document.",
      };
    }

    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        available: false,
        message: "The EC2 metadata service request timed out.",
      };
    }

    if (error instanceof TypeError) {
      return {
        available: false,
        message:
          "The EC2 metadata service is unavailable. This app may not be running on an EC2 instance.",
      };
    }

    throw error;
  }
}

async function InstanceDetails() {
  const result = await getInstanceMetadata();

  return (
    <>
      {result.available ? (
        <dl className="mt-8 grid gap-4 sm:grid-cols-2">
          {[
            ["Instance ID", result.instance.instanceId],
            ["Instance type", result.instance.instanceType],
            ["Region", result.instance.region],
            ["Availability zone", result.instance.availabilityZone],
            ["Private IP", result.instance.privateIp],
          ].map(([label, value]) => (
            <div
              key={label}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <dt className="text-sm text-zinc-500 dark:text-zinc-400">
                {label}
              </dt>
              <dd className="mt-1 break-all font-mono text-sm font-medium text-zinc-950 dark:text-white">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <div
          role="status"
          className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
        >
          <p className="font-semibold">Instance metadata unavailable</p>
          <p className="mt-1 text-sm">{result.message}</p>
        </div>
      )}
    </>
  );
}

export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center bg-zinc-50 px-6 py-16 font-sans dark:bg-black">
      <section className="w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-amber-700 dark:text-amber-400">
          AWS EC2 Sample App
        </p>
        <h1 className="mt-3 text-3xl font-bold text-zinc-950 dark:text-white">
          Instance information
        </h1>
        <p className="mt-2 text-zinc-600 dark:text-zinc-400">
          Retrieved from the EC2 Instance Metadata Service using IMDSv2.
        </p>
        <Suspense
          fallback={
            <p
              role="status"
              className="mt-8 rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400"
            >
              Fetching EC2 instance information...
            </p>
          }
        >
          <InstanceDetails />
        </Suspense>
      </section>
    </main>
  );
}
