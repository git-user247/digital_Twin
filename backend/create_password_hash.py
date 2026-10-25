from getpass import getpass

from backend.auth import hash_password


def main() -> None:
    password = getpass("New doctor password: ")
    confirmation = getpass("Confirm doctor password: ")
    if password != confirmation:
        raise SystemExit("Passwords do not match.")
    try:
        print(hash_password(password))
    except ValueError as error:
        raise SystemExit(str(error)) from error


if __name__ == "__main__":
    main()
