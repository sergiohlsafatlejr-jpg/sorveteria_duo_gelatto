CREATE TABLE `nfe_imports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`chNFe` varchar(44),
	`nNF` varchar(20) NOT NULL,
	`emitCnpj` varchar(14) NOT NULL,
	`emitNome` varchar(255),
	`dhEmi` varchar(30),
	`vNF` decimal(12,2) NOT NULL DEFAULT '0',
	`totalItems` int NOT NULL DEFAULT 0,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `nfe_imports_id` PRIMARY KEY(`id`),
	CONSTRAINT `nfe_imports_chNFe_unique` UNIQUE(`chNFe`)
);
