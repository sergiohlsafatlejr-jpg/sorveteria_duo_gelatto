CREATE TABLE `purchase_product_config` (
	`id` int AUTO_INCREMENT NOT NULL,
	`produtoId` int NOT NULL,
	`nomeProduto` varchar(200) NOT NULL,
	`ignorar` boolean NOT NULL DEFAULT false,
	`motivoIgnorar` varchar(200),
	`unidadeCompra` varchar(50),
	`fatorConversao` decimal(10,4),
	`qtdMinimaEstoque` decimal(10,2),
	`qtdLoteCompra` decimal(10,2),
	`observacao` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchase_product_config_id` PRIMARY KEY(`id`),
	CONSTRAINT `purchase_product_config_produtoId_unique` UNIQUE(`produtoId`)
);
