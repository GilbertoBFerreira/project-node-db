
# Project structure and steps

## Setting Up the Node.js Environment
### Initialize a new Node.js project and install the required dependencies.
- `npm init -y`
- `npm install express winston axios forever`

### Install dependencies just run
- `npm install`

### Install forever global to be used by command ursoDB
- `npm install -g forever`

### Install jq in distro local machine
#### Open your sources file in a text editor:
- `sudo nano /etc/apt/sources.list`
#### Then re-index apt-get so that it can find jq
- `deb http://us.archive.ubuntu.com/ubuntu vivid main universe`
####  Then re-index apt-get so that it can find jq
- `sudo apt-get update`
#### Then do the normal install and you should be the proud new user of jq
- `sudo apt-get install jq`

## Creating Configuration Files and Scripts (already exist inside projet)
Create the `ursoDB` command script in `ursoDB/ursoDB`

### Make the script executable
- `chmod +x ursoDB` 

## Defining the Server Structures (already exist inside projet)
Create the `configure.json` file in `ursoDB/etc`

## Implementing Logging (already exist inside projet)
Create a logger using the winston module in `ursoDB/src/logger.js`

## Handling HTTP Requests

### Reverse Proxy (RP) Server (already exist inside projet)
Create the `RP` server in `ursoDB/src/rp.js`

### Data Node (DN) Server (already exist inside projet)
Create the `DN` server in `ursoDB/src/dn.js`

## Implementing the Election Algorithm
In the `DN` server, update the `/election` route to handle the election process

This will involve communication between the nodes in a `DN` to decide on a master. Here is a simple implementation

