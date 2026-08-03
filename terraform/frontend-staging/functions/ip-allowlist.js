// Restricts staging.storywriter.net to a small list of viewer IPs.
//
// Staging is a private test environment, but CloudFront serves it to the whole
// internet. A security group cannot help here: the distribution has no ENI and
// no security group. A viewer-request function is the earliest point at which
// the viewer's address can be seen, so the block happens before the cache and
// before the S3 origin is ever consulted.
//
// The list is templated in from Terraform (var.allowed_viewer_cidrs), so the
// generated file is the single source of truth -- do not edit the deployed
// function in the console, the next apply overwrites it.
//
// Note this only guards the static app bundle. The API at
// staging-api.storywriter.net is a separate EC2 instance and is NOT covered by
// this function; the browser calls it directly from the viewer's machine.

var ALLOWED = ${allowed_ips_json};

function handler(event) {
    // Exact addresses only. CloudFront Functions has no CIDR matching, and
    // hand-rolling one in a 10 KB / sub-millisecond function is not worth it
    // for a one-person allowlist. Widen this only if a range is genuinely
    // needed, and prefer WAF with an IP set at that point.
    if (ALLOWED.indexOf(event.viewer.ip) !== -1) {
        return event.request;
    }

    return {
        statusCode: 403,
        statusDescription: 'Forbidden',
        headers: {
            'content-type': { value: 'text/plain; charset=utf-8' },
            // Never let a 403 be cached against an address: the allowlist
            // changes whenever a home IP is reassigned.
            'cache-control': { value: 'no-store' }
        },
        body: 'staging.storywriter.net is restricted to approved addresses.\n'
    };
}
