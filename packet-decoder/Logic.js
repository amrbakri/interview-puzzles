function hexToBinary(hex) {
  return hex
    .split("")
    .map(h => parseInt(h, 16).toString(2).padStart(4, "0"))
    .join("");
}

function parseLiteralPackets(binary, i) {
  const version = parseInt(binary.slice(i, i + 3), 2);
  const packetTypeId = parseInt(binary.slice(i + 3, i + 6), 2);

  i += 6;//seek 6 places (from 0 to 5) "skip the three bits for packet version, and skip the three bits for packet literal value"

  let valueBits = "";

  while (true) {
    const prefix = binary[i];
    valueBits += binary.slice(i + 1, i + 5);
    i += 5;

    if (prefix === "0") break;
  }

  return {
    type: "literalPacket",
    version,
    packetTypeId,
    decimalContentInPacket: parseInt(valueBits, 2),
    nextIndex: i
  };
}

// ----------------------------
// operator packet
// ----------------------------
function parseOperatorPackets(binary, i) {
  const version = parseInt(binary.slice(i, i + 3), 2);
  const packetTypeId = parseInt(binary.slice(i + 3, i + 6), 2);

  i += 6;

  const lengthTypeId = binary[i];
  i += 1;

  const subPackets = [];
// An operator packet contains one or more packets. To indicate which subsequent binary data represents its sub-packets,
// an operator packet can use one of two modes indicated by the bit immediately after the packet header; this is called 
// the length type ID:

  let totalLength = null;
  if (lengthTypeId === "0") {
    // If the length type ID is 0, then the next 15 bits are a number that represents the total length in bits of the sub-packets 
    // contained by this packet.
    //totalLength = number of bits occupied by ALL sub-packets
    //i = 22   <- sub-packets start
    // totalLength = 27
    // bits 22 → 49
    totalLength = parseInt(binary.slice(i, i + 15), 2);//convert binary string to deciaml
    i += 15;

    const end = i + totalLength;

    while (i < end) {
      const packet = parsePacket(binary, i);
      subPackets.push(packet);
      i = packet.nextIndex;
    }
  } else {
    // If the length type ID is 1, then the next 11 bits are a number that represents the number of sub-packets immediately contained by 
    // this packet.
    const numPackets = parseInt(binary.slice(i, i + 11), 2);
    i += 11;

    for (let k = 0; k < numPackets; k++) {
      const packet = parsePacket(binary, i);
      subPackets.push(packet);
      i = packet.nextIndex;
    }
  }

  return {
    type: "operatorPacket",
    version,
    packetTypeId,
    subPackets,
    subPacketsLen: subPackets.length,
    lengthTypeId,
    numOFBitsInSubPackets: totalLength,
    nextIndex: i,
  };
}

// ----------------------------
// main parser
// ----------------------------
function parsePacket(binary, i = 0) {
  const typeId = parseInt(binary.slice(i + 3, i + 6), 2);

  if (typeId === 4) {
    return parseLiteralPackets(binary, i);
  }

  return parseOperatorPackets(binary, i);
}

function applyPacketOperator(packet) {

  if (packet.type === "literalPacket") {
    return {
      type: "literal",
      value: packet.decimalContentInPacket
    };
  }

  // evaluate children first
  const evaluatedChildren = packet.subPackets.map(p => applyPacketOperator(p));

  // extract numeric values from children
  const values = evaluatedChildren.map(child =>
    child.type === "literal"
      ? child.value
      : child.result
  );
  let result;
  let operator;

  // -------------------------
  // OPERATORS
  // -------------------------
  switch (packet.packetTypeId) {
    case 0:
      operator = "sum";
      result = values.reduce((a, b) => a + b, 0);
      break;

    case 1:
      operator = "product";
      result = values.reduce((a, b) => a * b, 1);
      break;

    case 2:
      operator = "min";
      result = Math.min(...values);
      break;

    case 3:
      operator = "max";
      result = Math.max(...values);
      break;

    case 5:
      operator = "greaterThan";
      result = values[0] > values[1] ? 1 : 0;
      break;

    case 6:
      operator = "lessThan";
      result = values[0] < values[1] ? 1 : 0;
      break;

    case 7:
      operator = "equal";
      result = values[0] === values[1] ? 1 : 0;
      break;

    default:
      throw new Error("Unknown packet type: " + packet.packetTypeId);
  }

  return {
    type: "operation",
    operator,
    operands: values,
    result,
    children: evaluatedChildren 
  };
}
function addVersionSum(packet) {
  let sum = packet.version;
  
  //or:   if (packet.subPackets && packet.subPackets.length > 0) { 
  if (packet.type === "operatorPacket" && packet.subPackets) {
    for (const subPacket of packet.subPackets) {
      sum += addVersionSum(subPacket);
    }
  }
  
  packet.totalVersionSum = sum;
  return sum;
}

// ----------------------------
// RUN-LOGIC "input hexa-decimal here"
// ----------------------------
const hex = "220D62004EF14266BBC5AB7A824C9C1802B360760094CE7601339D8347E20020264D0804CA95C33E006EA00085C678F31B80010B88319E1A1802D8010D4BC268927FF5EFE7B9C94D0C80281A00552549A7F12239C0892A04C99E1803D280F3819284A801B4CCDDAE6754FC6A7D2F89538510265A3097BDF0530057401394AEA2E33EC127EC3010060529A18B00467B7ABEE992B8DD2BA8D292537006276376799BCFBA4793CFF379D75CA1AA001B11DE6428402693BEBF3CC94A314A73B084A21739B98000010338D0A004CF4DCA4DEC80488F004C0010A83D1D2278803D1722F45F94F9F98029371ED7CFDE0084953B0AD7C633D2FF070C013B004663DA857C4523384F9F5F9495C280050B300660DC3B87040084C2088311C8010C84F1621F080513AC910676A651664698DF62EA401934B0E6003E3396B5BBCCC9921C18034200FC608E9094401C8891A234080330EE31C643004380296998F2DECA6CCC796F65224B5EBBD0003EF3D05A92CE6B1B2B18023E00BCABB4DA84BCC0480302D0056465612919584662F46F3004B401600042E1044D89C200CC4E8B916610B80252B6C2FCCE608860144E99CD244F3C44C983820040E59E654FA6A59A8498025234A471ED629B31D004A4792B54767EBDCD2272A014CC525D21835279FAD49934EDD45802F294ECDAE4BB586207D2C510C8802AC958DA84B400804E314E31080352AA938F13F24E9A8089804B24B53C872E0D24A92D7E0E2019C68061A901706A00720148C404CA08018A0051801000399B00D02A004000A8C402482801E200530058AC010BA8018C00694D4FA2640243CEA7D8028000844648D91A4001088950462BC2E600216607480522B00540010C84914E1E0002111F21143B9BFD6D9513005A4F9FC60AB40109CBB34E5D89C02C82F34413D59EA57279A42958B51006A13E8F60094EF81E66D0E737AE08";
const binary = hexToBinary(hex);

const result = parsePacket(binary);
addVersionSum(result);// call by reference

console.log("===== ASSIGNMENT_1 RESULT =====");
console.log(JSON.stringify(result, null, 2));
console.log("===== END ASSIGNMENT_1 =====")

// console.log("===== ASSIGNMENT_2 RESULT =====");
// console.log("OperatorsResults:", JSON.stringify(applyPacketOperator(result), null, 2));
// console.log("===== END ASSIGNMENT_2 =====")
