#!/bin/bash

sudo mount -t tmpfs -o size=32M,noatime tmpfs ./tmp

# To run passwordless, add below to /etc/sudoers (use visudo): 
# username ALL=(ALL) NOPASSWD: /path/to/docent/mount_tmpfs.sh
