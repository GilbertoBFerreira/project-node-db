
# Project structure and steps

# Instructions
- :no_entry_sign: - It's not should be done! It's already be done on project config! 
- :heavy_exclamation_mark: - It's should be done!

## Setting Up the Node.js Environment
### Initialize a new Node.js project and install the required dependencies (Jump this section, it's only for first time config structure :no_entry_sign:
- `npm init -y`
- `npm install express winston axios forever`

### Install dependencies  :heavy_exclamation_mark:
- `npm install`

### Install forever global to be used by command ursoDB  :heavy_exclamation_mark:
- `npm install -g forever`

### Install jq in distro local machine  :heavy_exclamation_mark:
#### Open your sources file in a text editor:
- `sudo nano /etc/apt/sources.list`
#### Then re-index apt-get so that it can find jq
- `deb http://us.archive.ubuntu.com/ubuntu vivid main universe`
####  Then re-index apt-get so that it can find jq
- `sudo apt-get update`
#### Then do the normal install and you should be the proud new user of jq :heavy_exclamation_mark:
- `sudo apt-get install jq`

## Creating Configuration Files and Scripts (already exist inside projet) :no_entry_sign:
Create the `ursoDB` command script in `ursoDB/ursoDB`

### Make the script executable :heavy_exclamation_mark:
- `chmod +x ursoDB` 

## Defining the Server Structures (already exist inside projet) :no_entry_sign:
Create the `configure.json` file in `ursoDB/etc`

## Implementing Logging (already exist inside projet) :no_entry_sign:
Create a logger using the winston module in `ursoDB/src/logger.js`

## Handling HTTP Requests

### Reverse Proxy (RP) Server (already exist inside projet) :no_entry_sign:
Create the `RP` server in `ursoDB/src/rp.js`

### Data Node (DN) Server (already exist inside projet) :no_entry_sign:
Create the `DN` server in `ursoDB/src/dn.js`

## Implementing the Election Algorithm  :interrobang:
In the `DN` server, update the `/election` route to handle the election process

This will involve communication between the nodes in a `DN` to decide on a master. Here is a simple implementation

