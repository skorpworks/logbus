'use strict'

// Parse lines and emit structured event.
//

const moment = require('moment')

function Plugin(config) {
}

Plugin.prototype.onInput = function(line) {
  try {
    var m = line.match(/^(\S+)\s+(\S+)\s+([^[]+)\[(\d+)\]:\s+(.+)\s+FAC:(\d+)\s+SEV:(\d+)/)
    if (!m) {
      return
    }
    var event = {
      type: 'qry',
      ts: moment.utc(m[1]),
      hostname: m[2].toLowerCase(),
      process: m[3].toLowerCase().replace(/_/g, '-'),
      pid: parseInt(m[4]),
      severity: parseInt(m[7])
    }
    m[5].split(/\s+/).forEach(function(i) {
      var l = i.split(/[:=]/)
      event[l[0]] = l[1]
    })
    if (!event.DIP || !event.DIP.match(/^172/)) {
      return
    }
    if (!event.Q || event.Q.startsWith('<Root>')) {
      return
    }
    // Append trailing '.' or path_hierarchy tokenizer won't work:
    // $ curl -s $ES/dns-2016.07/_analyze?pretty -d '{"field": "Q", "text": "foo.bar.com"}' | jq '.tokens[] | .token'
    //   "foo.barcom"
    //   "barcom"
    // $ curl -s $ES/dns-2016.07/_analyze?pretty -d '{"field": "Q", "text": "foo.bar.com."}' | jq '.tokens[] | .token'
    //   "foo.bar.com"
    //   "bar.com"
    //   "com"
    if (!event.Q.endsWith('.')) {
      event.Q += '.'
    }
    event.R = []
    if (event.IP4 != null && event.IP6 != null) {
      event.R = event.IP4.split(',').concat(event.IP6.split(',')).filter(function(i) {
        return i.trim()
      })
    }
    delete event.IP4
    delete event.IP6
    if (event.R.length === 0) {
      event.R = ['0.0.0.0']
    }
    event.C = CLASSES[event.C]
    event.T = TYPES[event.T]
    event.D = Math.round(parseFloat(event.D) * 1000000)
    event._id = [event.ts.toISOString(), event.hostname, event.T, event.Q].join('::')
    event.message = event.Q + ' ' + event.T + ' ' + event.R[0]
    this.emitEvent(event)
  }
  catch (err) {
    this.emitError(err)
  }
}

module.exports = Plugin

const CLASSES = {
  '0x0000'    : 'RESERVED',
  '0x00000000': 'RESERVED',
  '0x0001'    : 'INTERNET',
  '0x00000001': 'INTERNET',
  '0x0002'    : 'UNASSIGNED',
  '0x00000002': 'UNASSIGNED',
  '0x0003'    : 'CHAOS',
  '0x00000003': 'CHAOS',
  '0x0004'    : 'HESIOD',
  '0x00000004': 'HESIOD'
}

const TYPES = {
  '0x0001': 'A',
  '1'     : 'A',
  '0x0002': 'NS',
  '2'     : 'NS',
  '0x0003': 'MD',
  '3'     : 'MD',
  '0x0004': 'MF',
  '4'     : 'MF',
  '0x0005': 'CNAME',
  '5'     : 'CNAME',
  '0x0006': 'SOA',
  '6'     : 'SOA',
  '0x0007': 'MB',
  '7'     : 'MB',
  '0x0008': 'MG',
  '8'     : 'MG',
  '0x0009': 'MR',
  '9'     : 'MR',
  '0x000a': 'NULL',
  '10'    : 'NULL',
  '0x000b': 'WKS',
  '11'    : 'WKS',
  '0x000c': 'PTR',
  '12'    : 'PTR',
  '0x000d': 'HINFO',
  '13'    : 'HINFO',
  '0x000e': 'MINFO',
  '14'    : 'MINFO',
  '0x000f': 'MX',
  '15'    : 'MX',
  '0x0010': 'TXT',
  '16'    : 'TXT',
  '0x0011': 'RP',
  '17'    : 'RP',
  '0x0012': 'AFSDB',
  '18'    : 'AFSDB',
  '0x0013': 'X25',
  '19'    : 'X25',
  '0x0014': 'ISDN',
  '20'    : 'ISDN',
  '0x0015': 'RT',
  '21'    : 'RT',
  '0x0016': 'NSAP',
  '22'    : 'NSAP',
  '0x0017': 'NSAP-PTR',
  '23'    : 'NSAP-PTR',
  '0x0018': 'SIG',
  '24'    : 'SIG',
  '0x0019': 'KEY',
  '25'    : 'KEY',
  '0x001a': 'PX',
  '26'    : 'PX',
  '0x001b': 'GPOS',
  '27'    : 'GPOS',
  '0x001c': 'AAAA',
  '28'    : 'AAAA',
  '0x001d': 'LOC',
  '29'    : 'LOC',
  '0x001e': 'NXT',
  '30'    : 'NXT',
  '0x001f': 'EID',
  '31'    : 'EID',
  '0x0020': 'NIMLOC',
  '32'    : 'NIMLOC',
  '0x0021': 'SRV',
  '33'    : 'SRV',
  '0x0022': 'ATMA',
  '34'    : 'ATMA',
  '0x0023': 'NAPTR',
  '35'    : 'NAPTR',
  '0x0024': 'KX',
  '36'    : 'KX',
  '0x0025': 'CERT',
  '37'    : 'CERT',
  '0x0026': 'A6',
  '38'    : 'A6',
  '0x0027': 'DNAME',
  '39'    : 'DNAME',
  '0x0028': 'SINK',
  '40'    : 'SINK',
  '0x0029': 'OPT',
  '41'    : 'OPT',
  '0x002a': 'APL',
  '42'    : 'APL',
  '0x002b': 'DS',
  '43'    : 'DS',
  '0x002c': 'SSHFP',
  '44'    : 'SSHFP',
  '0x002d': 'IPSECKEY',
  '45'    : 'IPSECKEY',
  '0x002e': 'RRSIG',
  '46'    : 'RRSIG',
  '0x002f': 'NSEC',
  '47'    : 'NSEC',
  '0x0030': 'DNSKEY',
  '48'    : 'DNSKEY',
  '0x0031': 'DHCID',
  '49'    : 'DHCID',
  '0x0032': 'NSEC3',
  '50'    : 'NSEC3',
  '0x0033': 'NSEC3PARAM',
  '51'    : 'NSEC3PARAM',
  '0x0034': 'TLSA',
  '52'    : 'TLSA',
  '0x0035': 'SMIMEA',
  '53'    : 'SMIMEA',
  '0x0036': 'UNASSIGNED',
  '54'    : 'UNASSIGNED',
  '0x0037': 'HIP',
  '55'    : 'HIP',
  '0x0038': 'NINFO',
  '56'    : 'NINFO',
  '0x0039': 'RKEY',
  '57'    : 'RKEY',
  '0x003a': 'TALINK',
  '58'    : 'TALINK',
  '0x003b': 'CDS',
  '59'    : 'CDS',
  '0x003c': 'CDNSKEY',
  '60'    : 'CDNSKEY',
  '0x003d': 'OPENPGPKEY',
  '61'    : 'OPENPGPKEY',
  '0x003e': 'CSYNC',
  '62'    : 'CSYNC'
}
