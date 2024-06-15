# rpc-crawler
rpc crawler for researching cosmos networks

This software will seed itself given the name of a [supported network](https://github.com/cosmos/chain-registry), and query net_info.  It then recursively fetches the net_info for all open rpc connections discovered in step 1, and repeats this process for some time.

It will output a file which can then be used as a lazy load balancer, which ideally should reduce the average load on public infrastructure without causeing any negative effect on any specific node and saving the user from any rate-limiting related headaches.

### Install
```bash
# no install needed, just clone repo
cd ./rpc-crawler && yarn
```

### Usage

to check multiple networks run with chain name(s) and crawl-depth as flag(s)
```bash
node rpc_load_balancer.js --chain=akash --chain=osmosis --depth=3
```

### Output

output is saved to json

```json
{
  "chains": {
    "osmosis": {
      "endpoints": {
        "rpc": [
          "rpc1",
          "rpc2",
          "rpc3"
        ],
        "rest": [
          "rest1",
          "rest2",
          "rest3"
        ],
        "grpc": [
          "grpc1",
          "grpc2"
        ]
      }
    },
    "cosmoshub": {
      "endpoints": {
        "rpc": [
          "rpc1",
          "rpc2"
        ],
        "rest": [
          "rest1",
          "rest2"
        ],
        "grpc": [
          "grpc1"
        ]
      }
    }
  }
}
```
