from cap.services.vega.facade import VegaConverter

def print_converted_table(result: dict) -> None:
    table = result.get("data", result)

    context = table.get("context", {})
    columns = table.get("values", [])

    if context:
        print("Context:")
        for key, value in context.items():
            print(f"  {key}: {value}")
        print()

    if not columns:
        print("(empty table)")
        return

    headers = [next(k for k in col if k.startswith("col")) for col in columns]
    header_names = [col[h] for col, h in zip(columns, headers)]
    rows = list(zip(*(col["values"] for col in columns)))

    widths = [
        max(len(str(name)), *(len(str(row[i])) for row in rows))
        for i, name in enumerate(header_names)
    ]

    print("headers")
    print(headers)

    print("header_names")
    print(header_names)

    print(" | ".join(str(name).ljust(widths[i]) for i, name in enumerate(header_names)))
    print("-+-".join("-" * width for width in widths))

    for row in rows:
        print(" | ".join(str(value).ljust(widths[i]) for i, value in enumerate(row)))


def test_convert_table_tokens_with_price_information():
    synthetic_data = [
        {
            "asset_id": "ada",
            "symbol": "ADA",
            "name": "Cardano",
            "asset_type": "token",
            "decimals": 6,
            "source": "binance_spot",
            "quote_asset": "ADAUSDT",
            "source_market_id": "ADAUSDT",
            "first_price_timestamp": "2018-04-17T04:00:00+00:00",
            "latest_price_timestamp": "2026-06-17T14:00:00+00:00",
            "price_points": 71515,
        },
        {
            "asset_id": "agix",
            "symbol": "AGIX",
            "name": "SingularityNET",
            "asset_type": "token",
            "decimals": 8,
            "source": "binance_spot",
            "quote_asset": "AGIXUSDT",
            "source_market_id": "AGIXUSDT",
            "first_price_timestamp": "2023-02-17T08:00:00+00:00",
            "latest_price_timestamp": "2024-06-30T23:00:00+00:00",
            "price_points": 11991,
        },
        {
            "asset_id": "fet",
            "symbol": "FET",
            "name": "Artificial Superintelligence Alliance",
            "asset_type": "token",
            "decimals": 8,
            "source": "binance_spot",
            "quote_asset": "FETUSDT",
            "source_market_id": "FETUSDT",
            "first_price_timestamp": "2024-07-01T00:00:00+00:00",
            "latest_price_timestamp": "2026-06-17T13:00:00+00:00",
            "price_points": 17198,
        },
        {
            "asset_id": "night",
            "symbol": "NIGHT",
            "name": "Midnight",
            "asset_type": "token",
            "decimals": 6,
            "source": "binance_spot",
            "quote_asset": "NIGHTUSDT",
            "source_market_id": "NIGHTUSDT",
            "first_price_timestamp": "2026-03-11T15:00:00+00:00",
            "latest_price_timestamp": "2026-06-17T14:00:00+00:00",
            "price_points": 2352,
        },
    ]

    synthetic_kv = {
        "result_type": "table",
        "data": synthetic_data
    }
    result = VegaConverter.convert_to_vega_format(
        kv_results=synthetic_kv,
        user_query="Show all tokens that have price information",
        sparql_query="",
    )

    print_converted_table(result)

if __name__ == "__main__":
    test_convert_table_tokens_with_price_information()
